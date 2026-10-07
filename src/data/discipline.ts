import type { HREmployee } from '../types';
import { addDays, exKey, fmtDate, type DayRecord } from './timeEngine';
import { HR_OFFICER, SUPERVISOR } from './timeConfig';

/* ------------------------------------------------------------------ */
/* Disciplinary cases (Employment Act 2007 s.41, s.44)                  */
/* ------------------------------------------------------------------ */

export type CaseCategory = 'ABSENTEEISM' | 'LATENESS' | 'MISCONDUCT' | 'GROSS_MISCONDUCT' | 'POOR_PERFORMANCE' | 'SAFETY_BREACH';
export type CaseStage = 'RAISED' | 'INVESTIGATION' | 'SHOW_CAUSE' | 'HEARING' | 'OUTCOME' | 'APPEAL' | 'CLOSED';
export type Sanction = 'NO_ACTION' | 'VERBAL' | 'WRITTEN' | 'FINAL_WRITTEN' | 'SUSPENSION' | 'SUMMARY_DISMISSAL' | 'TERMINATION_NOTICE';
export type LetterKind = 'SHOW_CAUSE' | 'HEARING' | 'WARNING' | 'SUSPENSION' | 'OUTCOME';

export const CATEGORY_LABEL: Record<CaseCategory, string> = {
  ABSENTEEISM: 'Absenteeism',
  LATENESS: 'Lateness',
  MISCONDUCT: 'Misconduct',
  GROSS_MISCONDUCT: 'Gross misconduct',
  POOR_PERFORMANCE: 'Poor performance',
  SAFETY_BREACH: 'Safety breach'
};

export const STAGE_LABEL: Record<CaseStage, string> = {
  RAISED: 'Raised',
  INVESTIGATION: 'Investigation',
  SHOW_CAUSE: 'Show cause',
  HEARING: 'Hearing',
  OUTCOME: 'Outcome',
  APPEAL: 'Appeal',
  CLOSED: 'Closed'
};
export const STAGES: CaseStage[] = ['RAISED', 'INVESTIGATION', 'SHOW_CAUSE', 'HEARING', 'OUTCOME', 'APPEAL', 'CLOSED'];

export const SANCTION_LABEL: Record<Sanction, string> = {
  NO_ACTION: 'No action',
  VERBAL: 'Verbal warning',
  WRITTEN: 'Written warning',
  FINAL_WRITTEN: 'Final written warning',
  SUSPENSION: 'Suspension',
  SUMMARY_DISMISSAL: 'Summary dismissal',
  TERMINATION_NOTICE: 'Termination with notice'
};

/** How long a warning stays live on file, in months. */
export const WARNING_MONTHS: Partial<Record<Sanction, number>> = { VERBAL: 3, WRITTEN: 6, FINAL_WRITTEN: 12 };
export const APPEAL_DAYS = 14;
export const SHOW_CAUSE_DAYS = 7;

const LADDER: Sanction[] = ['NO_ACTION', 'VERBAL', 'WRITTEN', 'FINAL_WRITTEN', 'TERMINATION_NOTICE'];
const BASE: Record<CaseCategory, Sanction> = {
  ABSENTEEISM: 'WRITTEN',
  LATENESS: 'VERBAL',
  MISCONDUCT: 'WRITTEN',
  GROSS_MISCONDUCT: 'SUMMARY_DISMISSAL',
  POOR_PERFORMANCE: 'VERBAL',
  SAFETY_BREACH: 'WRITTEN'
};

export interface CaseEvent {
  at: string;
  by: string;
  text: string;
}

export interface CaseDocument {
  id: string;
  name: string;
  kind: LetterKind | 'STATEMENT' | 'MINUTES' | 'EVIDENCE';
  on: string;
}

export interface CaseOutcome {
  sanction: Sanction;
  decidedOn: string;
  reasons: string;
  expiresOn?: string;
  suspension?: { from: string; to: string; pay: 'HALF' | 'NONE' };
  reductionId?: string;
  effectiveDate?: string;
  noticeDays?: number;
  separationNote?: string;
}

export interface DisciplinaryCase {
  id: string;
  orgId: string;
  staffId: string;
  category: CaseCategory;
  summary: string;
  incidentDate: string;
  raisedOn: string;
  raisedBy: string;
  stage: CaseStage;
  /** Attendance days the case is about */
  absenceDates?: string[];
  investigation?: { officer: string; findings?: string; completedOn?: string };
  showCause?: { issuedOn: string; responseDue: string; allegations: string; response?: string; respondedOn?: string };
  hearing?: { date: string; time: string; venue: string; panel: string[]; representative: string; attended?: boolean; minutes?: string };
  outcome?: CaseOutcome;
  appeal?: { lodgedOn: string; grounds: string; status: 'PENDING' | 'DISMISSED' | 'UPHELD' | 'VARIED'; decidedOn?: string; decision?: string };
  closedOn?: string;
  timeline: CaseEvent[];
  documents: CaseDocument[];
}

const isWarning = (s?: Sanction) => s === 'VERBAL' || s === 'WRITTEN' || s === 'FINAL_WRITTEN';

/** Warnings on file that have not expired (overturned appeals excluded). */
export const activeWarnings = (cases: DisciplinaryCase[], staffId: string, today: string) =>
  cases.filter((c) => c.staffId === staffId && isWarning(c.outcome?.sanction) && c.appeal?.status !== 'UPHELD' && (c.outcome?.expiresOn ?? '') >= today && (c.outcome?.decidedOn ?? '') <= today);

/** Sanction to suggest: the category's usual step, raised one step above the most serious live warning. */
export const suggestSanction = (cases: DisciplinaryCase[], staffId: string, category: CaseCategory, today: string, excludeId?: string) => {
  const live = activeWarnings(cases.filter((c) => c.id !== excludeId), staffId, today);
  const base = BASE[category];
  if (base === 'SUMMARY_DISMISSAL') return { sanction: base, reason: 'Gross misconduct (s.44(4)) can justify summary dismissal after a fair hearing.', live };
  const top = Math.max(0, ...live.map((c) => LADDER.indexOf(c.outcome!.sanction)));
  const idx = Math.max(LADDER.indexOf(base), top + (live.length ? 1 : 0));
  const sanction = LADDER[Math.min(idx, LADDER.length - 1)];
  const reason = live.length
    ? `Repeat offence: ${live.length} live warning${live.length > 1 ? 's' : ''} on file (most serious: ${SANCTION_LABEL[LADDER[top]].toLowerCase()}), so the next step is ${SANCTION_LABEL[sanction].toLowerCase()}.`
    : `First offence of this kind: ${SANCTION_LABEL[sanction].toLowerCase()} is the usual step.`;
  return { sanction, reason, live };
};

export const addMonthsIso = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Next action and deadline for an open case. */
export const nextStep = (c: DisciplinaryCase, today: string): { text: string; due?: string; overdue?: boolean } => {
  switch (c.stage) {
    case 'RAISED':
      return { text: 'Assign an investigating officer' };
    case 'INVESTIGATION':
      return { text: 'Record findings, then issue a show-cause letter or close' };
    case 'SHOW_CAUSE': {
      const due = c.showCause?.responseDue;
      return c.showCause?.response ? { text: 'Schedule the disciplinary hearing' } : { text: 'Awaiting written response', due, overdue: !!due && due < today };
    }
    case 'HEARING':
      return { text: c.hearing && c.hearing.date > today ? `Hearing on ${fmtDate(c.hearing.date)} at ${c.hearing.time}` : 'Record the hearing outcome', due: c.hearing?.date };
    case 'OUTCOME': {
      const until = addDays(c.outcome?.decidedOn ?? today, APPEAL_DAYS);
      return { text: until >= today ? `Appeal window open until ${fmtDate(until)}` : 'Appeal window closed; close the case', due: until };
    }
    case 'APPEAL':
      return { text: 'Appeal to be heard by a manager not involved in the first hearing' };
    default:
      return { text: c.outcome ? SANCTION_LABEL[c.outcome.sanction] : 'Closed' };
  }
};

/* ------------------------------------------------------------------ */
/* Seed cases, consistent with the attendance history                  */
/* ------------------------------------------------------------------ */

export const seedSuspension = (today: string) => ({ staffId: 'KHE-0302', from: addDays(today, -56), to: addDays(today, -54) });

export const seedCases = (employees: HREmployee[], days: DayRecord[], today: string): DisciplinaryCase[] => {
  const d = (n: number) => addDays(today, n);
  const ev = (n: number, text: string, by = HR_OFFICER): CaseEvent => ({ at: d(n), by, text });
  const doc = (id: string, n: number, kind: CaseDocument['kind'], label: string): CaseDocument => ({ id, name: label, kind, on: d(n) });
  const org = 'org-kericho';
  const panel = [`${SUPERVISOR} (chair)`, `${HR_OFFICER} (HR)`, 'Ruth Chebet (QHSE)'];

  // Lateness case built from Purity's punches over the last four weeks
  const lateDays = days.filter((x) => x.staffId === 'KHE-1101' && x.date >= d(-28) && x.lateMin > 0);
  const lateMins = lateDays.reduce((n, x) => n + x.lateMin, 0);
  // Caroline's September absences (already confirmed as unauthorised)
  const sepAbs = days.filter((x) => x.staffId === 'KHE-1107' && x.status === 'ABSENT' && x.date < d(-13) && x.date >= d(-35)).map((x) => x.date);

  const cases: DisciplinaryCase[] = [
    {
      id: 'DC-2026-031',
      orgId: org,
      staffId: 'KHE-1101',
      category: 'LATENESS',
      summary: `Late on ${lateDays.length} shifts in the last four weeks (${lateMins} minutes in total) despite an informal reminder from the shift supervisor.`,
      incidentDate: lateDays[lateDays.length - 1]?.date ?? d(-2),
      raisedOn: d(-1),
      raisedBy: SUPERVISOR,
      stage: 'RAISED',
      absenceDates: lateDays.map((x) => x.date),
      timeline: [ev(-1, 'Case raised from the attendance exceptions queue', SUPERVISOR)],
      documents: [doc('DOC-311', -1, 'EVIDENCE', 'Timesheet extract, last four weeks')]
    },
    {
      id: 'DC-2026-030',
      orgId: org,
      staffId: 'KHE-0303',
      category: 'GROSS_MISCONDUCT',
      summary: 'Company vehicle KDB 412X used for a private trip on a Sunday; tracker shows 140 km off the authorised route.',
      incidentDate: d(-10),
      raisedOn: d(-8),
      raisedBy: 'Esther Muthoni',
      stage: 'INVESTIGATION',
      investigation: { officer: 'Mary Wambui' },
      timeline: [ev(-8, 'Case raised by the operations manager', SUPERVISOR), ev(-7, 'Mary Wambui appointed to investigate; tracker report and fuel log requested')],
      documents: [doc('DOC-301', -8, 'EVIDENCE', 'Vehicle tracker report'), doc('DOC-302', -7, 'EVIDENCE', 'Fuel card statement')]
    },
    {
      id: 'DC-2026-029',
      orgId: org,
      staffId: 'KHE-1104',
      category: 'MISCONDUCT',
      summary: 'Refused a lawful instruction to move to Line 2 during a breakdown and used abusive language towards the shift supervisor.',
      incidentDate: d(-9),
      raisedOn: d(-8),
      raisedBy: SUPERVISOR,
      stage: 'SHOW_CAUSE',
      investigation: { officer: 'Kevin Ouma', findings: 'Two witness statements confirm the refusal; CCTV has no audio.', completedOn: d(-4) },
      showCause: { issuedOn: d(-3), responseDue: d(SHOW_CAUSE_DAYS - 3), allegations: 'Insubordination and abusive language towards a supervisor on the factory floor.' },
      timeline: [ev(-8, 'Case raised', SUPERVISOR), ev(-7, 'Kevin Ouma appointed to investigate'), ev(-4, 'Investigation complete: case to answer'), ev(-3, 'Show-cause letter issued; response due in 7 days')],
      documents: [doc('DOC-291', -6, 'STATEMENT', 'Witness statement, line leader'), doc('DOC-292', -6, 'STATEMENT', 'Witness statement, machine operator'), doc('DOC-293', -3, 'SHOW_CAUSE', 'Show-cause letter')]
    },
    {
      id: 'DC-2026-027',
      orgId: org,
      staffId: 'KHE-1112',
      category: 'SAFETY_BREACH',
      summary: 'Operated the shrink-wrap machine with the guard removed after being told to stop by the QHSE officer.',
      incidentDate: d(-15),
      raisedOn: d(-14),
      raisedBy: 'Ruth Chebet',
      stage: 'HEARING',
      investigation: { officer: 'Ruth Chebet', findings: 'Guard found removed; employee admits running the machine to clear a backlog.', completedOn: d(-13) },
      showCause: { issuedOn: d(-12), responseDue: d(-5), allegations: 'Breach of the machine-guarding procedure (OSHA 2007 s.13) and of a direct safety instruction.', response: 'Accepts the guard was off; says the line supervisor asked for the backlog to be cleared before lunch.', respondedOn: d(-8) },
      hearing: { date: d(2), time: '10:00', venue: 'Boardroom, Block A', panel, representative: 'KPAWU shop steward (Wilson Kiprotich)' },
      timeline: [ev(-14, 'Case raised by QHSE', 'Ruth Chebet'), ev(-13, 'Investigation complete: case to answer'), ev(-12, 'Show-cause letter issued'), ev(-8, 'Written response received'), ev(-6, `Hearing set for ${fmtDate(d(2))}; employee chose the shop steward as representative`)],
      documents: [doc('DOC-271', -14, 'EVIDENCE', 'QHSE incident report'), doc('DOC-272', -12, 'SHOW_CAUSE', 'Show-cause letter'), doc('DOC-273', -8, 'STATEMENT', 'Employee response'), doc('DOC-274', -6, 'HEARING', 'Notice of hearing')]
    },
    {
      id: 'DC-2026-024',
      orgId: org,
      staffId: 'KHE-1100',
      category: 'MISCONDUCT',
      summary: 'Left the packing line unattended for 50 minutes during a night shift; product lost to a jam.',
      incidentDate: d(-30),
      raisedOn: d(-29),
      raisedBy: SUPERVISOR,
      stage: 'APPEAL',
      investigation: { officer: 'Kevin Ouma', findings: 'Turnstile log shows exit at 01:12 and return at 02:02.', completedOn: d(-27) },
      showCause: { issuedOn: d(-26), responseDue: d(-19), allegations: 'Abandoning a running line without relief.', response: 'Went to the clinic with stomach pains; could not find the supervisor.', respondedOn: d(-22) },
      hearing: { date: d(-17), time: '14:00', venue: 'Boardroom, Block A', panel, representative: 'Fellow employee (Victor Chebet)', attended: true, minutes: 'Clinic has no record of a visit that night. Panel finds the allegation proved.' },
      outcome: { sanction: 'FINAL_WRITTEN', decidedOn: d(-15), reasons: 'Allegation proved; second conduct matter this year.', expiresOn: addMonthsIso(d(-15), 12) },
      appeal: { lodgedOn: d(-9), grounds: 'Sanction too harsh; asks for the clinic’s night register to be checked again.', status: 'PENDING' },
      timeline: [ev(-29, 'Case raised', SUPERVISOR), ev(-26, 'Show-cause letter issued'), ev(-22, 'Response received'), ev(-17, 'Hearing held with representative present'), ev(-15, 'Final written warning issued (12 months)'), ev(-9, 'Appeal lodged within the 14-day window')],
      documents: [doc('DOC-241', -26, 'SHOW_CAUSE', 'Show-cause letter'), doc('DOC-242', -17, 'MINUTES', 'Hearing minutes'), doc('DOC-243', -15, 'WARNING', 'Final written warning'), doc('DOC-244', -9, 'STATEMENT', 'Letter of appeal')]
    },
    {
      id: 'DC-2026-022',
      orgId: org,
      staffId: 'KHE-1107',
      category: 'ABSENTEEISM',
      summary: `Absent without leave or lawful cause on ${sepAbs.map((x) => fmtDate(x)).join(', ') || 'several days'}.`,
      incidentDate: sepAbs[sepAbs.length - 1] ?? d(-17),
      raisedOn: d(-15),
      raisedBy: HR_OFFICER,
      stage: 'OUTCOME',
      absenceDates: sepAbs,
      showCause: { issuedOn: d(-14), responseDue: d(-7), allegations: 'Absence without permission on the dates listed.', response: 'Family matters; did not call in.', respondedOn: d(-11) },
      hearing: { date: d(-9), time: '09:00', venue: 'HR office', panel: [`${SUPERVISOR} (chair)`, `${HR_OFFICER} (HR)`], representative: 'Declined a representative', attended: true },
      outcome: { sanction: 'WRITTEN', decidedOn: d(-8), reasons: 'Absence admitted; no lawful cause shown.', expiresOn: addMonthsIso(d(-8), 6) },
      timeline: [ev(-15, 'Case raised from attendance (unauthorised absences)'), ev(-14, 'Show-cause letter issued'), ev(-9, 'Hearing held'), ev(-8, 'Written warning issued (6 months)')],
      documents: [doc('DOC-221', -14, 'SHOW_CAUSE', 'Show-cause letter'), doc('DOC-222', -8, 'WARNING', 'Written warning')]
    },
    {
      id: 'DC-2026-017',
      orgId: org,
      staffId: 'KHE-1109',
      category: 'LATENESS',
      summary: 'Repeated late arrival on the day shift during July.',
      incidentDate: d(-62),
      raisedOn: d(-60),
      raisedBy: SUPERVISOR,
      stage: 'CLOSED',
      showCause: { issuedOn: d(-58), responseDue: d(-51), allegations: 'Late on six shifts in July.', response: 'Matatu route changed; now using the staff bus.', respondedOn: d(-55) },
      outcome: { sanction: 'VERBAL', decidedOn: d(-50), reasons: 'Explanation partly accepted; verbal warning recorded on file.', expiresOn: addMonthsIso(d(-50), 3) },
      closedOn: d(-35),
      timeline: [ev(-60, 'Case raised', SUPERVISOR), ev(-58, 'Show-cause letter issued'), ev(-50, 'Verbal warning recorded (3 months)'), ev(-35, 'Closed; no appeal')],
      documents: [doc('DOC-171', -58, 'SHOW_CAUSE', 'Show-cause letter'), doc('DOC-172', -50, 'WARNING', 'Record of verbal warning')]
    },
    {
      id: 'DC-2026-014',
      orgId: org,
      staffId: 'KHE-0302',
      category: 'SAFETY_BREACH',
      summary: 'Tracker recorded 94 km/h on the estate road (limit 40) with a full load of tea.',
      incidentDate: d(-66),
      raisedOn: d(-65),
      raisedBy: 'Esther Muthoni',
      stage: 'CLOSED',
      showCause: { issuedOn: d(-64), responseDue: d(-57), allegations: 'Over-speeding with a loaded vehicle.', response: 'Admits; was late for the factory cut-off.', respondedOn: d(-62) },
      hearing: { date: d(-59), time: '11:00', venue: 'Transport office', panel, representative: 'Fellow employee (Samuel Ouma)', attended: true },
      outcome: { sanction: 'SUSPENSION', decidedOn: d(-58), reasons: 'Serious safety risk; three days’ unpaid suspension and refresher training.', suspension: { ...seedSuspension(today), pay: 'NONE' } },
      closedOn: d(-44),
      timeline: [ev(-65, 'Case raised'), ev(-64, 'Show-cause letter issued'), ev(-59, 'Hearing held'), ev(-58, `Suspended without pay ${fmtDate(seedSuspension(today).from)} to ${fmtDate(seedSuspension(today).to)}; deducted in that month’s payroll`), ev(-44, 'Closed; no appeal')],
      documents: [doc('DOC-141', -64, 'SHOW_CAUSE', 'Show-cause letter'), doc('DOC-142', -58, 'SUSPENSION', 'Suspension letter')]
    },
    {
      id: 'DC-2026-011',
      orgId: org,
      staffId: 'KHE-1102',
      category: 'POOR_PERFORMANCE',
      summary: 'Line output 18% below target for two months.',
      incidentDate: d(-90),
      raisedOn: d(-88),
      raisedBy: SUPERVISOR,
      stage: 'CLOSED',
      investigation: { officer: 'Faith Akinyi', findings: 'Machine 3 was under-performing; not the operator’s fault.', completedOn: d(-80) },
      outcome: { sanction: 'NO_ACTION', decidedOn: d(-80), reasons: 'Shortfall traced to equipment; maintenance ticket raised.' },
      closedOn: d(-80),
      timeline: [ev(-88, 'Case raised', SUPERVISOR), ev(-80, 'Closed: no case to answer')],
      documents: []
    },
    {
      id: 'DC-2025-062',
      orgId: org,
      staffId: 'KHE-0263',
      category: 'MISCONDUCT',
      summary: 'Store issue made without a signed requisition.',
      incidentDate: '2025-11-03',
      raisedOn: '2025-11-04',
      raisedBy: 'Esther Muthoni',
      stage: 'CLOSED',
      outcome: { sanction: 'WRITTEN', decidedOn: '2025-11-20', reasons: 'Procedure breach admitted.', expiresOn: '2026-05-20' },
      closedOn: '2025-12-05',
      timeline: [{ at: '2025-11-04', by: 'Esther Muthoni', text: 'Case raised' }, { at: '2025-11-20', by: HR_OFFICER, text: 'Written warning issued (6 months)' }],
      documents: [{ id: 'DOC-621', name: 'Written warning', kind: 'WARNING', on: '2025-11-20' }]
    }
  ];
  return cases.filter((c) => employees.some((e) => e.staffId === c.staffId));
};

/** Days in a case that came from attendance, for the exception keys. */
export const caseAbsenceKeys = (c: DisciplinaryCase) => (c.absenceDates ?? []).map((d) => exKey(c.category === 'LATENESS' ? 'LATE' : 'ABSENT', c.staffId, d));
