import { useMemo, useState } from 'react';
import type { HREmployee, OshPermit } from '../types';
import type { PayrollContext } from '../data/payrollEngine';
import { exKey, fmtDate, isoOf, type DayRecord, type TimeDecision } from '../data/timeEngine';
import { buildOshSeed, EST_WEEKLY_HOURS, PERMIT_TYPES, SAFETY_OFFICER, WIBA_INSURER, WIBA_POLICY, type OshSeed } from '../data/oshConfig';
import {
  addMonths,
  isReportable,
  nowLocal,
  permitBlockers,
  ppeFor,
  siteOf,
  toLegacyPermit,
  wibaEarnings,
  wibaEstimate,
  type ActionStatus,
  type ClaimBasis,
  type CommitteeMeeting,
  type CorrectiveAction,
  type FireDrill,
  type GasTest,
  type Inspection,
  type Isolation,
  type MedicalExam,
  type OshIncident,
  type PpeIssue,
  type Responder,
  type WibaClaim,
  type WorkPermit
} from '../data/oshEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };

export type NewIncident = Pick<OshIncident, 'kind' | 'occurredOn' | 'time' | 'site' | 'location' | 'description' | 'severity' | 'immediateActions' | 'witnesses'> &
  Partial<Pick<OshIncident, 'staffId' | 'bodyPart' | 'injuryNature' | 'lostDays' | 'offWorkFrom'>>;
export type NewAction = Pick<CorrectiveAction, 'text' | 'owner' | 'due'>;
export type NewPermit = Pick<WorkPermit, 'type' | 'location' | 'work' | 'holder' | 'validFrom' | 'validTo' | 'requestedBy'> & Partial<Pick<WorkPermit, 'holderStaffId' | 'fireWatch' | 'isolations'>>;
/** Where a corrective action lives */
export type ActionRef = { source: 'incident' | 'inspection' | 'meeting'; id: string; actionId: string };

/** Occupational safety and health state exposed through the app context. */
export interface OshStateSlice {
  oshToday: string;
  oshIncidents: OshIncident[];
  wibaClaims: WibaClaim[];
  workPermits: WorkPermit[];
  ppeIssues: PpeIssue[];
  oshInspections: Inspection[];
  fireDrills: FireDrill[];
  oshResponders: Responder[];
  medicalExams: MedicalExam[];
  oshStatutory: OshSeed['statutory'];
  oshCommittee: OshSeed['committee'];
  committeeMeetings: CommitteeMeeting[];
  jhaReviews: OshSeed['jhaReviews'];
  /** Hours worked in the selected company over 12 months: from attendance where tracked, else headcount × 45 h/week */
  oshHours: { hours: number; weekly: number; source: 'attendance' | 'estimate'; headcount: number };
  /** Older permit shape (side drawer and other screens) */
  oshPermits: OshPermit[];
  tenantOshPermits: OshPermit[];
  closeOshPermit: (id: string) => void;

  reportIncident: (draft: NewIncident) => OshIncident | null;
  startInvestigation: (id: string, lead: string) => void;
  saveInvestigation: (id: string, whys: string[], rootCause: string, complete: boolean) => boolean;
  addIncidentAction: (id: string, a: NewAction) => boolean;
  setOshAction: (ref: ActionRef, status: ActionStatus, note?: string) => void;
  fileDoshNotice: (id: string, ref: string, on: string) => boolean;
  recordReturnToWork: (id: string, on: string) => void;
  closeIncident: (id: string) => boolean;
  /** Marks the injured employee's absent days as authorised in attendance (no pay reduction). Returns days recorded. */
  authoriseInjuryAbsence: (id: string) => number;
  injuryAbsenceDays: (id: string) => string[];

  raiseWibaClaim: (incidentId: string, basis: ClaimBasis, ppdPercent: number, medicalKes: number, funeralKes: number) => WibaClaim | null;
  updateWibaClaim: (id: string, patch: Partial<Pick<WibaClaim, 'basis' | 'ppdPercent' | 'medicalKes' | 'funeralKes' | 'ttdDays'>>) => void;
  advanceWibaClaim: (id: string, amount?: number) => void;

  requestPermit: (draft: NewPermit) => WorkPermit | null;
  approvePermit: (id: string) => void;
  rejectPermit: (id: string, reason: string) => void;
  addGasTest: (id: string, t: Omit<GasTest, 'at'>) => void;
  addIsolation: (id: string, iso: Omit<Isolation, 'verified'>) => void;
  verifyIsolation: (id: string, index: number) => void;
  activatePermit: (id: string) => boolean;
  closeWorkPermit: (id: string, note: string) => boolean;

  issuePpe: (lines: Omit<PpeIssue, 'id' | 'orgId' | 'issuedBy'>[]) => number;

  scheduleInspection: (areaId: string, date: string, inspector: string) => void;
  /** Records an inspection; without a booked id it is logged as an unplanned inspection today. */
  completeInspection: (areaId: string, id: string | undefined, results: Inspection['results'], findings: { text: string; owner: string; due: string }[]) => void;
  recordDrill: (d: Omit<FireDrill, 'id' | 'orgId'>) => void;
  addResponder: (r: Omit<Responder, 'id' | 'orgId'>) => void;
  recordMedical: (m: Omit<MedicalExam, 'id' | 'orgId'>) => void;
  recordStatutory: (id: string, lastDone: string, ref: string, by: string) => void;
  recordMeeting: (m: Omit<CommitteeMeeting, 'id' | 'orgId' | 'actions'>, actions: NewAction[]) => void;
  reviewJha: (role: string) => void;
}

interface Deps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  payrollCtx: PayrollContext;
  timeDays: DayRecord[];
  timeDecisions: Record<string, TimeDecision>;
  confirmAbsences: (staffId: string, dates: string[], status: 'AUTHORISED' | 'UNAUTHORISED', reason: string) => void;
  addToast: (t: Toast) => void;
}

const nextNo = (ids: string[], prefix: string) => {
  const n = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
};
const PERMIT_CODE: Record<WorkPermit['type'], string> = { HOT_WORK: 'HOT', CONFINED_SPACE: 'CSE', WORK_AT_HEIGHT: 'WAH', ELECTRICAL: 'LOTO', BOILER: 'BLR', CHEMICAL: 'CHEM' };

export const useOshState = (deps: Deps): OshStateSlice => {
  const { hrEmployees, selectedOrgId, payrollCtx, timeDays, timeDecisions, confirmAbsences, addToast } = deps;
  const [today] = useState(() => isoOf(new Date()));

  const [seed] = useState(() => {
    const s = buildOshSeed(today, hrEmployees, siteOf, ppeFor);
    // Claims carry the earnings the payroll engine paid in the month before the accident
    s.claims = s.claims.map((c) => {
      const e = hrEmployees.find((x) => x.staffId === c.staffId);
      const inc = s.incidents.find((i) => i.id === c.incidentId);
      if (!e || !inc) return c;
      const earn = wibaEarnings(e, inc.occurredOn, payrollCtx);
      const filled = { ...c, monthlyEarnings: earn.amount, earningsPeriod: earn.period };
      const total = wibaEstimate(filled).total;
      return { ...filled, assessedKes: c.status === 'NOTIFIED' ? undefined : total, paidKes: c.status === 'PAID' ? total : undefined };
    });
    return s;
  });

  const [incidents, setIncidents] = useState(seed.incidents);
  const [claims, setClaims] = useState(seed.claims);
  const [permits, setPermits] = useState(seed.permits);
  const [ppeIssues, setPpe] = useState(seed.ppeIssues);
  const [inspections, setInspections] = useState(seed.inspections);
  const [drills, setDrills] = useState(seed.drills);
  const [responders, setResponders] = useState(seed.responders);
  const [medicals, setMedicals] = useState(seed.medicals);
  const [statutory, setStatutory] = useState(seed.statutory);
  const [committee] = useState(seed.committee);
  const [meetings, setMeetings] = useState(seed.meetings);
  const [jhaReviews, setJha] = useState(seed.jhaReviews);

  const nameOf = (staffId?: string) => (staffId ? hrEmployees.find((e) => e.staffId === staffId)?.fullName ?? staffId : '');
  const fail = (title: string, message: string) => {
    addToast({ type: 'error', title, message });
    return false;
  };
  const log = (by: string, text: string) => ({ at: today, by, text });
  const patchIncident = (id: string, f: (i: OshIncident) => OshIncident) => setIncidents((xs) => xs.map((i) => (i.id === id ? f(i) : i)));
  const patchPermit = (id: string, f: (p: WorkPermit) => WorkPermit) => setPermits((xs) => xs.map((p) => (p.id === id ? f(p) : p)));

  const oshHours = useMemo(() => {
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED');
    const days = timeDays.filter((d) => d.orgId === selectedOrgId);
    if (days.length) {
      const dates = new Set(days.map((d) => d.date));
      const worked = days.reduce((a, d) => a + d.workedH, 0);
      const weekly = worked / Math.max(1, dates.size / 7);
      return { hours: Math.round(weekly * 52), weekly: Math.round(weekly), source: 'attendance' as const, headcount: staff.length };
    }
    return { hours: staff.length * EST_WEEKLY_HOURS * 52, weekly: staff.length * EST_WEEKLY_HOURS, source: 'estimate' as const, headcount: staff.length };
  }, [hrEmployees, selectedOrgId, timeDays]);

  /* ---------------- Incidents ---------------- */

  const reportIncident: OshStateSlice['reportIncident'] = (d) => {
    if (!d.description.trim() || !d.location.trim()) {
      fail('Incident not saved', 'Give the location and what happened.');
      return null;
    }
    if (d.kind !== 'NEAR_MISS' && d.kind !== 'DANGEROUS_OCCURRENCE' && !d.staffId) {
      fail('Incident not saved', 'Choose the injured or affected employee.');
      return null;
    }
    if (d.occurredOn > today) {
      fail('Incident not saved', 'The date cannot be in the future.');
      return null;
    }
    const id = nextNo(incidents.map((i) => i.id), `INC-${today.slice(0, 4)}-`);
    const inc: OshIncident = {
      ...d,
      id,
      orgId: selectedOrgId,
      lostDays: d.lostDays ?? 0,
      reportedBy: SAFETY_OFFICER,
      reportedOn: today,
      status: 'REPORTED',
      actions: [],
      history: [log(SAFETY_OFFICER, 'Reported')]
    };
    setIncidents((xs) => [inc, ...xs]);
    addToast({
      type: 'success',
      title: `${id} reported`,
      message: isReportable(inc) ? `DOSH Form 1 must reach the area office by ${inc.severity === 'FATAL' ? 'within 24 hours' : 'day 7'}.` : 'Logged for investigation and trend analysis.'
    });
    return inc;
  };

  const startInvestigation: OshStateSlice['startInvestigation'] = (id, lead) =>
    patchIncident(id, (i) => ({ ...i, status: 'INVESTIGATING', investigation: { lead, startedOn: today, whys: [], rootCause: '' }, history: [...i.history, log(lead, 'Investigation started')] }));

  const saveInvestigation: OshStateSlice['saveInvestigation'] = (id, whys, rootCause, complete) => {
    const clean = whys.map((w) => w.trim()).filter(Boolean);
    if (complete && (clean.length < 3 || !rootCause.trim())) return fail('Investigation not complete', 'Ask "why" at least three times and record the root cause.');
    patchIncident(id, (i) => ({
      ...i,
      status: complete ? 'ACTIONS' : i.status,
      investigation: { ...(i.investigation ?? { lead: SAFETY_OFFICER, startedOn: today }), whys: clean, rootCause: rootCause.trim(), completedOn: complete ? today : undefined },
      history: complete ? [...i.history, log(i.investigation?.lead ?? SAFETY_OFFICER, `Root cause: ${rootCause.trim()}`)] : i.history
    }));
    addToast({ type: 'success', title: complete ? 'Investigation complete' : 'Investigation saved', message: complete ? 'Add corrective actions with an owner and due date.' : 'Draft kept.' });
    return true;
  };

  const addIncidentAction: OshStateSlice['addIncidentAction'] = (id, a) => {
    if (!a.text.trim() || !a.owner.trim() || !a.due) return fail('Action not added', 'Give the action, an owner and a due date.');
    patchIncident(id, (i) => ({ ...i, status: i.status === 'CLOSED' ? 'ACTIONS' : i.status, actions: [...i.actions, { id: `A${i.actions.length + 1}`, text: a.text.trim(), owner: a.owner, due: a.due, status: 'OPEN' }] }));
    addToast({ type: 'success', title: 'Corrective action added', message: `${a.owner}, due ${fmtDate(a.due)}.` });
    return true;
  };

  const setOshAction: OshStateSlice['setOshAction'] = (ref, status, note) => {
    const upd = (a: CorrectiveAction): CorrectiveAction =>
      a.id !== ref.actionId
        ? a
        : status === 'DONE'
          ? { ...a, status, doneOn: today, note: note ?? a.note }
          : status === 'VERIFIED'
            ? { ...a, status, verifiedBy: SAFETY_OFFICER, verifiedOn: today }
            : { ...a, status: 'OPEN', doneOn: undefined, verifiedBy: undefined, verifiedOn: undefined, note: note ?? a.note };
    if (ref.source === 'incident') patchIncident(ref.id, (i) => ({ ...i, actions: i.actions.map(upd) }));
    if (ref.source === 'inspection') setInspections((xs) => xs.map((x) => (x.id === ref.id ? { ...x, findings: x.findings.map((f) => ({ ...f, action: upd(f.action) })) } : x)));
    if (ref.source === 'meeting') setMeetings((xs) => xs.map((x) => (x.id === ref.id ? { ...x, actions: x.actions.map(upd) } : x)));
    addToast({ type: 'success', title: status === 'DONE' ? 'Action done' : status === 'VERIFIED' ? 'Action verified' : 'Action reopened', message: status === 'VERIFIED' ? `Verified effective by ${SAFETY_OFFICER}.` : 'Corrective action updated.' });
  };

  const fileDoshNotice: OshStateSlice['fileDoshNotice'] = (id, ref, on) => {
    if (!ref.trim()) return fail('Not recorded', 'Enter the DOSHS acknowledgement reference.');
    patchIncident(id, (i) => ({ ...i, dosh: { notifiedOn: on, ref: ref.trim(), by: SAFETY_OFFICER }, history: [...i.history, log(SAFETY_OFFICER, `DOSH/F1 filed (${ref.trim()})`)] }));
    addToast({ type: 'success', title: 'DOSH Form 1 filed', message: `Acknowledgement ${ref.trim()} recorded.` });
    return true;
  };

  const recordReturnToWork: OshStateSlice['recordReturnToWork'] = (id, on) =>
    patchIncident(id, (i) => {
      const days = i.offWorkFrom ? Math.max(0, Math.round((Date.parse(on) - Date.parse(i.offWorkFrom)) / 864e5)) : i.lostDays;
      addToast({ type: 'success', title: 'Return to work recorded', message: `${nameOf(i.staffId)} back on ${fmtDate(on)}: ${days} day${days === 1 ? '' : 's'} lost.` });
      return { ...i, returnedOn: on, lostDays: days, history: [...i.history, log(SAFETY_OFFICER, `Returned to work ${fmtDate(on)}`)] };
    });

  const closeIncident: OshStateSlice['closeIncident'] = (id) => {
    const i = incidents.find((x) => x.id === id);
    if (!i) return false;
    const needsInvestigation = i.kind !== 'INJURY' || i.severity !== 'FIRST_AID';
    if (needsInvestigation && !i.investigation?.completedOn) return fail('Cannot close', 'Complete the investigation first.');
    if (i.actions.some((a) => a.status !== 'VERIFIED' && a.status !== 'DONE')) return fail('Cannot close', 'Some corrective actions are still open.');
    if (isReportable(i) && !i.dosh) return fail('Cannot close', 'File DOSH Form 1 first.');
    patchIncident(id, (x) => ({ ...x, status: 'CLOSED', history: [...x.history, log(SAFETY_OFFICER, 'Closed')] }));
    addToast({ type: 'success', title: `${id} closed`, message: 'Kept on file for the annual safety audit.' });
    return true;
  };

  const injuryAbsenceDays: OshStateSlice['injuryAbsenceDays'] = (id) => {
    const i = incidents.find((x) => x.id === id);
    if (!i?.staffId || !i.offWorkFrom) return [];
    const end = i.returnedOn ?? '9999-12-31';
    return timeDays
      .filter((d) => d.staffId === i.staffId && d.date >= i.offWorkFrom! && d.date < end && d.status === 'ABSENT' && !timeDecisions[exKey('ABSENT', d.staffId, d.date)])
      .map((d) => d.date);
  };

  const authoriseInjuryAbsence: OshStateSlice['authoriseInjuryAbsence'] = (id) => {
    const i = incidents.find((x) => x.id === id);
    const dates = injuryAbsenceDays(id);
    if (!i?.staffId || !dates.length) {
      addToast({ type: 'info', title: 'Nothing to record', message: 'Attendance shows no unconfirmed absent days in the injury period.' });
      return 0;
    }
    confirmAbsences(i.staffId, dates, 'AUTHORISED', `Injury on duty ${i.id} (WIBA): full pay continues`);
    patchIncident(id, (x) => ({ ...x, absenceDates: [...(x.absenceDates ?? []), ...dates] }));
    return dates.length;
  };

  /* ---------------- WIBA ---------------- */

  const raiseWibaClaim: OshStateSlice['raiseWibaClaim'] = (incidentId, basis, ppdPercent, medicalKes, funeralKes) => {
    const i = incidents.find((x) => x.id === incidentId);
    const e = hrEmployees.find((x) => x.staffId === i?.staffId);
    if (!i || !e) {
      fail('Claim not raised', 'The incident needs an injured employee.');
      return null;
    }
    if (claims.some((c) => c.incidentId === incidentId)) {
      fail('Claim exists', 'This incident already has a WIBA claim.');
      return null;
    }
    const earn = wibaEarnings(e, i.occurredOn, payrollCtx);
    const ttdDays = i.offWorkFrom ? Math.max(i.lostDays, Math.round((Date.parse(i.returnedOn ?? today) - Date.parse(i.offWorkFrom)) / 864e5)) : i.lostDays;
    const c: WibaClaim = {
      id: nextNo(claims.map((x) => x.id), `WC-${today.slice(0, 4)}-`),
      orgId: i.orgId,
      incidentId,
      staffId: e.staffId,
      insurer: WIBA_INSURER,
      policyNo: WIBA_POLICY,
      basis,
      monthlyEarnings: earn.amount,
      earningsPeriod: earn.period,
      ttdDays,
      ppdPercent,
      medicalKes,
      funeralKes,
      status: 'NOTIFIED',
      notifiedOn: today,
      history: [log(SAFETY_OFFICER, `Notified to ${WIBA_INSURER}`)]
    };
    setClaims((xs) => [c, ...xs]);
    addToast({ type: 'success', title: `${c.id} notified`, message: `Estimate KES ${wibaEstimate(c).total.toLocaleString()} on earnings of KES ${earn.amount.toLocaleString()}/month.` });
    return c;
  };

  const updateWibaClaim: OshStateSlice['updateWibaClaim'] = (id, patch) => setClaims((xs) => xs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const advanceWibaClaim: OshStateSlice['advanceWibaClaim'] = (id, amount) =>
    setClaims((xs) =>
      xs.map((c) => {
        if (c.id !== id || c.status === 'PAID') return c;
        const est = wibaEstimate(c).total;
        if (c.status === 'NOTIFIED') return { ...c, status: 'ASSESSED', assessedKes: amount ?? est, history: [...c.history, log(c.insurer, `Assessed at KES ${(amount ?? est).toLocaleString()}`)] };
        if (c.status === 'ASSESSED') return { ...c, status: 'APPROVED', history: [...c.history, log(c.insurer, 'Approved')] };
        return { ...c, status: 'PAID', paidKes: amount ?? c.assessedKes ?? est, paidOn: today, history: [...c.history, log(c.insurer, `Paid KES ${(amount ?? c.assessedKes ?? est).toLocaleString()}`)] };
      })
    );

  /* ---------------- Permits ---------------- */

  const requestPermit: OshStateSlice['requestPermit'] = (d) => {
    if (!d.location.trim() || !d.work.trim() || !d.holder.trim()) {
      fail('Permit not raised', 'Give the location, the work and the permit holder.');
      return null;
    }
    if (d.validTo <= d.validFrom) {
      fail('Permit not raised', 'The permit must end after it starts.');
      return null;
    }
    if (Date.parse(d.validTo) - Date.parse(d.validFrom) > 12 * 3600_000) {
      fail('Permit not raised', 'A permit covers one shift — 12 hours at most.');
      return null;
    }
    const num = nextNo(permits.map((p) => p.number.replace(/^PTW-[A-Z]+-/, 'PTW-')), 'PTW-').slice(4);
    const p: WorkPermit = {
      ...d,
      id: `PTW-${Date.now().toString(36).toUpperCase()}`,
      orgId: selectedOrgId,
      number: `PTW-${PERMIT_CODE[d.type]}-${num}`,
      requestedOn: today,
      status: 'REQUESTED',
      precautions: [...PERMIT_TYPES[d.type].precautions],
      gasTests: [],
      isolations: d.isolations ?? []
    };
    setPermits((xs) => [p, ...xs]);
    addToast({ type: 'success', title: `${p.number} requested`, message: `Waiting for ${SAFETY_OFFICER} (safety officer) to approve.` });
    return p;
  };

  const approvePermit: OshStateSlice['approvePermit'] = (id) => {
    const p = permits.find((x) => x.id === id);
    if (!p) return;
    if (p.requestedBy === SAFETY_OFFICER) {
      fail('Not allowed', 'The safety officer cannot approve a permit they requested.');
      return;
    }
    patchPermit(id, (x) => ({ ...x, status: 'APPROVED', approvedBy: SAFETY_OFFICER, approvedAt: nowLocal() }));
    addToast({ type: 'success', title: `${p.number} approved`, message: 'Complete the checks on site, then make it active.' });
  };

  const rejectPermit: OshStateSlice['rejectPermit'] = (id, reason) => {
    patchPermit(id, (x) => ({ ...x, status: 'REJECTED', rejectReason: reason }));
    addToast({ type: 'info', title: 'Permit rejected', message: reason || 'Returned to the requester.' });
  };

  const addGasTest: OshStateSlice['addGasTest'] = (id, t) => patchPermit(id, (x) => ({ ...x, gasTests: [...x.gasTests, { ...t, at: nowLocal() }] }));
  const addIsolation: OshStateSlice['addIsolation'] = (id, iso) => patchPermit(id, (x) => ({ ...x, isolations: [...x.isolations, { ...iso, verified: false }] }));
  const verifyIsolation: OshStateSlice['verifyIsolation'] = (id, index) => patchPermit(id, (x) => ({ ...x, isolations: x.isolations.map((s, k) => (k === index ? { ...s, verified: !s.verified } : s)) }));

  const activatePermit: OshStateSlice['activatePermit'] = (id) => {
    const p = permits.find((x) => x.id === id);
    if (!p || p.status !== 'APPROVED') return false;
    const blockers = permitBlockers(p, nowLocal());
    if (blockers.length) return fail('Cannot start work', blockers.join('; '));
    patchPermit(id, (x) => ({ ...x, status: 'ACTIVE', activatedAt: nowLocal() }));
    addToast({ type: 'success', title: `${p.number} active`, message: `Work may start. Valid until ${fmtDate(p.validTo.slice(0, 10))} ${p.validTo.slice(11)}.` });
    return true;
  };

  const closeWorkPermit: OshStateSlice['closeWorkPermit'] = (id, note) => {
    const p = permits.find((x) => x.id === id);
    if (!p || p.status !== 'ACTIVE') return fail('Cannot close', 'Only an active permit can be closed out.');
    patchPermit(id, (x) => ({ ...x, status: 'CLOSED', closedAt: nowLocal(), closedBy: SAFETY_OFFICER, closeNote: note.trim() || 'Site inspected and cleared; isolations removed.' }));
    addToast({ type: 'info', title: `${p.number} closed`, message: 'Site cleared after close-out inspection.' });
    return true;
  };

  /* ---------------- PPE ---------------- */

  const issuePpe: OshStateSlice['issuePpe'] = (lines) => {
    const valid = lines.filter((l) => l.staffId && l.itemId && l.qty > 0);
    if (!valid.length) return 0;
    setPpe((xs) => {
      let n = xs.length;
      return [...xs, ...valid.map((l) => ({ ...l, id: `PPE-${String(++n).padStart(4, '0')}`, orgId: selectedOrgId, issuedBy: SAFETY_OFFICER }))];
    });
    addToast({ type: 'success', title: `${valid.length} PPE item${valid.length > 1 ? 's' : ''} issued`, message: `${nameOf(valid[0].staffId)}${new Set(valid.map((l) => l.staffId)).size > 1 ? ' and others' : ''}: signed for in the PPE register.` });
    return valid.length;
  };

  /* ---------------- Inspections, drills, responders, medicals, statutory ---------------- */

  const scheduleInspection: OshStateSlice['scheduleInspection'] = (areaId, date, inspector) => {
    setInspections((xs) => [...xs, { id: nextNo(xs.map((x) => x.id), 'INS-'), orgId: selectedOrgId, areaId, scheduledFor: date, inspector, status: 'SCHEDULED', results: {}, findings: [] }]);
    addToast({ type: 'success', title: 'Inspection scheduled', message: `${fmtDate(date)} · ${inspector}` });
  };

  const completeInspection: OshStateSlice['completeInspection'] = (areaId, id, results, findings) => {
    const done = (x: Inspection): Inspection => ({
      ...x,
      status: 'DONE',
      doneOn: today,
      results,
      findings: findings.map((f, k) => ({ id: `F${k + 1}`, text: f.text, action: { id: `F${k + 1}A`, text: f.text, owner: f.owner, due: f.due, status: 'OPEN' } }))
    });
    setInspections((xs) =>
      id
        ? xs.map((x) => (x.id === id ? done(x) : x))
        : [...xs, done({ id: nextNo(xs.map((x) => x.id), 'INS-'), orgId: selectedOrgId, areaId, scheduledFor: today, inspector: SAFETY_OFFICER, status: 'SCHEDULED', results: {}, findings: [] })]
    );
    addToast({ type: findings.length ? 'warning' : 'success', title: 'Inspection recorded', message: findings.length ? `${findings.length} finding${findings.length > 1 ? 's' : ''} raised as actions.` : 'No findings.' });
  };

  const recordDrill: OshStateSlice['recordDrill'] = (d) => {
    setDrills((xs) => [{ ...d, id: `FD-${Date.now().toString(36)}`, orgId: selectedOrgId }, ...xs]);
    addToast({ type: 'success', title: 'Fire drill recorded', message: `Evacuation in ${d.evacuationMin} min, ${d.participants} people.` });
  };

  const addResponder: OshStateSlice['addResponder'] = (r) => {
    setResponders((xs) => [...xs, { ...r, id: `R-${Date.now().toString(36)}`, orgId: selectedOrgId }]);
    addToast({ type: 'success', title: 'Certificate recorded', message: `${nameOf(r.staffId)} added as ${r.role === 'FIRST_AIDER' ? 'first aider' : 'fire marshal'}.` });
  };

  const recordMedical: OshStateSlice['recordMedical'] = (m) => {
    setMedicals((xs) => [...xs, { ...m, id: `MED-${Date.now().toString(36)}`, orgId: selectedOrgId }]);
    addToast({ type: m.result === 'UNFIT' ? 'warning' : 'success', title: 'Medical recorded', message: `${nameOf(m.staffId)}: ${m.result === 'FIT' ? 'fit' : m.result === 'FIT_RESTRICTED' ? 'fit with restrictions' : 'unfit — review the role'}.` });
  };

  const recordStatutory: OshStateSlice['recordStatutory'] = (id, lastDone, ref, by) => {
    setStatutory((xs) => xs.map((s) => (s.id === id ? { ...s, lastDone, ref: ref || s.ref, by: by || s.by } : s)));
    addToast({ type: 'success', title: 'Examination recorded', message: `Certificate ${ref} on file.` });
  };

  const recordMeeting: OshStateSlice['recordMeeting'] = (m, actions) => {
    setMeetings((xs) => [...xs, { ...m, id: `MTG-${Date.now().toString(36)}`, orgId: selectedOrgId, actions: actions.filter((a) => a.text.trim()).map((a, k) => ({ ...a, id: `C${k + 1}`, status: 'OPEN' as const })) }]);
    addToast({ type: 'success', title: 'Meeting minuted', message: `Next quarterly meeting due by ${fmtDate(addMonths(m.date, 3))}.` });
  };

  const reviewJha: OshStateSlice['reviewJha'] = (role) => {
    setJha((xs) => [...xs.filter((x) => x.role !== role), { role, reviewedOn: today, by: SAFETY_OFFICER }]);
    addToast({ type: 'success', title: 'Job hazard analysis reviewed', message: `${role}: next review in 12 months.` });
  };

  /* ---------------- Older permit API ---------------- */

  const now = nowLocal();
  const oshPermits = permits.filter((p) => p.status === 'ACTIVE' || p.status === 'CLOSED').map((p) => toLegacyPermit(p, now));
  const closeOshPermit = (id: string) => {
    closeWorkPermit(id, '');
  };

  return {
    oshToday: today,
    oshIncidents: incidents,
    wibaClaims: claims,
    workPermits: permits,
    ppeIssues,
    oshInspections: inspections,
    fireDrills: drills,
    oshResponders: responders,
    medicalExams: medicals,
    oshStatutory: statutory,
    oshCommittee: committee,
    committeeMeetings: meetings,
    jhaReviews,
    oshHours,
    oshPermits,
    tenantOshPermits: oshPermits.filter((p) => p.orgId === selectedOrgId),
    closeOshPermit,
    reportIncident,
    startInvestigation,
    saveInvestigation,
    addIncidentAction,
    setOshAction,
    fileDoshNotice,
    recordReturnToWork,
    closeIncident,
    authoriseInjuryAbsence,
    injuryAbsenceDays,
    raiseWibaClaim,
    updateWibaClaim,
    advanceWibaClaim,
    requestPermit,
    approvePermit,
    rejectPermit,
    addGasTest,
    addIsolation,
    verifyIsolation,
    activatePermit,
    closeWorkPermit,
    issuePpe,
    scheduleInspection,
    completeInspection,
    recordDrill,
    addResponder,
    recordMedical,
    recordStatutory,
    recordMeeting,
    reviewJha
  };
};
