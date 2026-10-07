import { useState } from 'react';
import type { HREmployee } from '../types';
import type { PayItem } from '../data/payItems';
import { basicFor, type PayrollContext } from '../data/payrollEngine';
import { addDays, fmtDate, isoOf, kes } from '../data/hireEngine';
import type { DisciplinaryCase } from '../data/discipline';
import type { NewCase } from './timeState';
import {
  COMPETENCIES,
  DEFAULT_SETTINGS,
  RATING_SCALE,
  buildPerfSeed,
  type Appraisal,
  type CalibrationEntry,
  type CheckIn,
  type DevNeed,
  type FeedbackEntry,
  type OrgGoal,
  type PerfCycle,
  type PerfEvent,
  type PerfGoal,
  type PerfSettings,
  type Pip,
  type Potential,
  type PriorRating,
  type Rating,
  type RewardRun,
  type RewardStep
} from '../data/perfConfig';
import { ratingOf, rewardCost, rewardEligible, rewardFor, scoreOf, weightTotal } from '../data/perfEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };
type Period = { year: number; month: number; key: string; label: string };

export type GoalDraft = Pick<PerfGoal, 'cycleId' | 'staffId' | 'perspective' | 'title' | 'measure' | 'unit' | 'target' | 'weight' | 'due'> &
  Partial<Pick<PerfGoal, 'id' | 'parentId' | 'actual' | 'progress'>>;

export interface AssessInput {
  goals: Record<string, { rating?: number; note?: string }>;
  comps: Record<string, number | undefined>;
  summary: string;
}

export interface PipDraft {
  staffId: string;
  appraisalId?: string;
  cycleId?: string;
  reason: string;
  objectives: { text: string; measure: string }[];
  support: string;
  reviewDates: string[];
}

/** Performance management state exposed through the app context. */
export interface PerfStateSlice {
  perfToday: string;
  perfSettings: PerfSettings;
  perfCycles: PerfCycle[];
  orgGoals: OrgGoal[];
  perfGoals: PerfGoal[];
  appraisals: Appraisal[];
  checkIns: CheckIn[];
  perfFeedback: FeedbackEntry[];
  calibrationLog: CalibrationEntry[];
  rewardRuns: RewardRun[];
  pips: Pip[];
  priorRatings: PriorRating[];
  perfAudit: PerfEvent[];
  updatePerfSettings: (patch: Partial<PerfSettings>, actorStaffId: string) => boolean;
  /** Adds or edits a goal while the sheet is a draft or returned. */
  saveGoal: (g: GoalDraft, actorStaffId: string) => boolean;
  removeGoal: (id: string, actorStaffId: string) => void;
  /** Sends the goal sheet to the supervisor; weights must add up to 100%. */
  submitGoals: (staffId: string, cycleId: string, actorStaffId: string) => boolean;
  decideGoals: (staffId: string, cycleId: string, approve: boolean, actorStaffId: string, comment?: string) => boolean;
  updateGoalProgress: (id: string, actual: string, progress: number, actorStaffId: string) => void;
  recordCheckIn: (id: string, input: Pick<CheckIn, 'status' | 'notes' | 'actions'>, actorStaffId: string) => boolean;
  addFeedback: (f: Omit<FeedbackEntry, 'id' | 'orgId' | 'on'>) => boolean;
  saveSelfAssessment: (id: string, input: AssessInput, submit: boolean, actorStaffId: string) => boolean;
  submitSupervisorReview: (id: string, input: AssessInput & { potential?: Potential; devNeeds: DevNeed[] }, actorStaffId: string) => boolean;
  submitHodReview: (id: string, input: { agree: boolean; rating?: Rating; comment: string }, actorStaffId: string) => boolean;
  /** HR calibration of one person (rating and potential); every change is logged. */
  calibrate: (id: string, rating: Rating, potential: Potential, reason: string, actorStaffId: string) => boolean;
  /** Confirms calibrated ratings and sends them to employees. Ratings at the PIP threshold open a plan. */
  releaseRatings: (ids: string[], actorStaffId: string) => number;
  acknowledgeAppraisal: (id: string, agree: boolean, comment: string, actorStaffId: string) => boolean;
  resolveDispute: (id: string, resolution: 'UPHELD' | 'REVISED', rating: Rating | undefined, note: string, actorStaffId: string) => boolean;
  markNeedsSent: (id: string, skills: string[]) => void;
  prepareRewardRun: (cycleId: string, opts: { bonusPeriod: string; meritEffective: string }, actorStaffId: string) => RewardRun | null;
  adjustRewardLine: (runId: string, staffId: string, patch: { newBasic?: number; bonus?: number }, note: string) => boolean;
  /** HR → Finance → managing director (only when over budget). Final approval posts bonuses and writes salary history. */
  decideRewardRun: (runId: string, approve: boolean, actorStaffId: string, comment?: string) => boolean;
  openPip: (draft: PipDraft, actorStaffId: string) => Pip | null;
  recordPipReview: (id: string, index: number, note: string, objectives: Record<string, Pip['objectives'][number]['status']>, actorStaffId: string) => boolean;
  closePip: (id: string, outcome: 'SUCCESSFUL' | 'EXTENDED' | 'REFERRED', note: string, actorStaffId: string, extendTo?: string) => boolean;
}

interface Deps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  payrollOpenPeriod: Period;
  payrollCtx: PayrollContext;
  postPayItems: (items: Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>[], by?: string) => number;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  raiseCase: (draft: NewCase) => DisciplinaryCase;
  addToast: (t: Toast) => void;
}

const isHr = (e?: HREmployee) => !!e && /\bHR\b|human resources/i.test(`${e.jobTitle} ${e.department}`);
const isFinance = (e?: HREmployee) => !!e && /finance (director|manager)|chief financial/i.test(e.jobTitle);
const isMd = (e?: HREmployee) => !!e && /managing director|chief executive/i.test(e.jobTitle);
const nextId = (ids: string[], prefix: string) => `${prefix}${String(Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1).padStart(3, '0')}`;
const monthKey = (k: string) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) - 1, key: k });

export const usePerfState = ({ hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, postPayItems, updateHrEmployee, raiseCase, addToast }: Deps): PerfStateSlice => {
  const [perfToday] = useState(() => isoOf(new Date()));
  const [seed] = useState(() => buildPerfSeed(hrEmployees));
  const [perfSettings, setSettings] = useState<PerfSettings>(DEFAULT_SETTINGS);
  const [perfCycles] = useState<PerfCycle[]>(seed.cycles);
  const [orgGoals] = useState<OrgGoal[]>(seed.orgGoals);
  const [perfGoals, setGoals] = useState<PerfGoal[]>(seed.goals);
  const [appraisals, setAppraisals] = useState<Appraisal[]>(seed.appraisals);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(seed.checkIns);
  const [perfFeedback, setFeedback] = useState<FeedbackEntry[]>(seed.feedback);
  const [calibrationLog, setCalLog] = useState<CalibrationEntry[]>(seed.calibrationLog);
  const [rewardRuns, setRuns] = useState<RewardRun[]>([]);
  const [pips, setPips] = useState<Pip[]>(seed.pips);
  const [priorRatings] = useState<PriorRating[]>(seed.prior);
  const [perfAudit, setAudit] = useState<PerfEvent[]>([]);

  const person = (id?: string) => (id ? hrEmployees.find((e) => e.staffId === id) : undefined);
  const nameOf = (id?: string) => person(id)?.fullName ?? id ?? '';
  const fail = (title: string, message: string) => {
    addToast({ type: 'error', title, message });
    return false;
  };
  const audit = (by: string, text: string) => setAudit((xs) => [{ at: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), by, text }, ...xs]);
  const event = (id: string, by: string, text: string, patch: Partial<Appraisal> = {}) =>
    setAppraisals((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch, timeline: [...a.timeline, { at: perfToday, by, text }] } : a)));
  const sheetOf = (staffId: string, cycleId: string, list = perfGoals) => list.filter((g) => g.staffId === staffId && g.cycleId === cycleId);
  const apFor = (staffId: string, cycleId: string) => appraisals.find((a) => a.staffId === staffId && a.cycleId === cycleId);

  /* ---------------------------------------------------------------- settings */

  const updatePerfSettings: PerfStateSlice['updatePerfSettings'] = (patch, actorStaffId) => {
    const actor = person(actorStaffId);
    if (!isHr(actor)) return fail('HR only', 'Only HR can change the appraisal policy.');
    const next = { ...perfSettings, ...patch };
    if (next.goalsWeight + next.competencyWeight !== 100) return fail('Weights must add up to 100%', `Goals ${next.goalsWeight}% + competencies ${next.competencyWeight}% = ${next.goalsWeight + next.competencyWeight}%.`);
    const g = Object.values(next.guideline).reduce((n, v) => n + v, 0);
    if (g !== 100) return fail('Guideline must add up to 100%', `It adds up to ${g}%.`);
    setSettings(next);
    audit(actor!.fullName, 'Appraisal policy updated');
    addToast({ type: 'success', title: 'Policy saved', message: 'Scores, guideline and reward matrices now use the new settings.' });
    return true;
  };

  /* ---------------------------------------------------------------- goals */

  const canEditSheet = (staffId: string, cycleId: string, actorStaffId: string) => {
    const actor = person(actorStaffId);
    const ap = apFor(staffId, cycleId);
    if (!actor) return fail('Choose who is acting', 'Pick the person making the change.');
    if (actor.staffId !== staffId && actor.staffId !== ap?.appraiserId && !isHr(actor)) return fail('Not allowed', `${actor.fullName} is not ${nameOf(staffId)}’s supervisor or HR.`);
    return true;
  };

  const saveGoal: PerfStateSlice['saveGoal'] = (g, actorStaffId) => {
    if (!canEditSheet(g.staffId, g.cycleId, actorStaffId)) return false;
    const existing = g.id ? perfGoals.find((x) => x.id === g.id) : undefined;
    if (existing && !['DRAFT', 'RETURNED'].includes(existing.status) && !(existing.status === 'APPROVED' && apFor(g.staffId, g.cycleId)?.stage === 'SELF'))
      return fail('Goal locked', 'Goals waiting for approval cannot change. Ask the supervisor to return them.');
    const missing = [!g.title.trim() && 'title', !g.measure.trim() && 'measure', !String(g.target).trim() && 'target', !g.due && 'due date', !(g.weight > 0) && 'weight'].filter(Boolean);
    if (missing.length) return fail('Goal incomplete', `Add the ${missing.join(', ')}.`);
    if (existing) {
      // Changing an approved goal sends the sheet back for approval
      setGoals((xs) => xs.map((x) => (x.id === existing.id ? { ...x, ...g, status: 'DRAFT', approvedBy: undefined, approvedOn: undefined } : x)));
    } else {
      setGoals((xs) => [...xs, { ...g, id: nextId(xs.map((x) => x.id), 'PG-'), actual: g.actual ?? '', progress: g.progress ?? 0, status: 'DRAFT' }]);
    }
    if (existing?.status === 'APPROVED') setGoals((xs) => xs.map((x) => (x.staffId === g.staffId && x.cycleId === g.cycleId ? { ...x, status: 'DRAFT' } : x)));
    addToast({ type: 'success', title: existing ? 'Goal updated' : 'Goal added', message: 'Submit the goal sheet for approval when the weights add up to 100%.' });
    return true;
  };

  const removeGoal: PerfStateSlice['removeGoal'] = (id, actorStaffId) => {
    const g = perfGoals.find((x) => x.id === id);
    if (!g || !canEditSheet(g.staffId, g.cycleId, actorStaffId)) return;
    if (g.status === 'SUBMITTED') {
      fail('Goal locked', 'Goals waiting for approval cannot be removed.');
      return;
    }
    setGoals((xs) => xs.filter((x) => x.id !== id).map((x) => (x.staffId === g.staffId && x.cycleId === g.cycleId ? { ...x, status: 'DRAFT' } : x)));
  };

  const submitGoals: PerfStateSlice['submitGoals'] = (staffId, cycleId, actorStaffId) => {
    if (!canEditSheet(staffId, cycleId, actorStaffId)) return false;
    const sheet = sheetOf(staffId, cycleId);
    if (!sheet.length) return fail('No goals', 'Add at least one goal.');
    const w = weightTotal(sheet);
    if (w !== 100) return fail('Weights must add up to 100%', `${nameOf(staffId)}’s goals add up to ${w}%.`);
    if (!sheet.some((g) => g.status === 'DRAFT' || g.status === 'RETURNED')) return fail('Nothing to submit', 'The goal sheet is already submitted or approved.');
    setGoals((xs) => xs.map((x) => (x.staffId === staffId && x.cycleId === cycleId ? { ...x, status: 'SUBMITTED', returnNote: undefined } : x)));
    audit(nameOf(actorStaffId), `Goal sheet of ${nameOf(staffId)} submitted`);
    const ap = apFor(staffId, cycleId);
    addToast({ type: 'success', title: 'Goals submitted', message: `Waiting for ${nameOf(ap?.appraiserId) || 'the supervisor'} to approve.` });
    return true;
  };

  const decideGoals: PerfStateSlice['decideGoals'] = (staffId, cycleId, approve, actorStaffId, comment) => {
    const actor = person(actorStaffId);
    const ap = apFor(staffId, cycleId);
    if (!actor) return fail('Choose who is acting', 'Pick the approver.');
    if (actor.staffId === staffId) return fail('Segregation of duties', 'Employees cannot approve their own goals.');
    if (actor.staffId !== ap?.appraiserId && actor.staffId !== ap?.hodId) return fail('Not the supervisor', `Goals are approved by ${nameOf(ap?.appraiserId)}.`);
    if (!approve && !comment?.trim()) return fail('Reason needed', 'Say what to change before returning the goals.');
    const sheet = sheetOf(staffId, cycleId);
    if (approve && weightTotal(sheet) !== 100) return fail('Weights must add up to 100%', 'Return the sheet so the weights can be fixed.');
    setGoals((xs) =>
      xs.map((x) =>
        x.staffId === staffId && x.cycleId === cycleId
          ? approve
            ? { ...x, status: 'APPROVED', approvedBy: actor.fullName, approvedOn: perfToday, returnNote: undefined }
            : { ...x, status: 'RETURNED', returnNote: comment!.trim() }
          : x
      )
    );
    if (ap) event(ap.id, actor.fullName, approve ? 'Goals approved' : `Goals returned: ${comment!.trim()}`);
    addToast({ type: approve ? 'success' : 'info', title: approve ? 'Goals approved' : 'Goals returned', message: `${nameOf(staffId)}: ${sheet.length} goals, ${weightTotal(sheet)}%.` });
    return true;
  };

  const updateGoalProgress: PerfStateSlice['updateGoalProgress'] = (id, actual, progress, actorStaffId) => {
    const g = perfGoals.find((x) => x.id === id);
    if (!g || !canEditSheet(g.staffId, g.cycleId, actorStaffId)) return;
    setGoals((xs) => xs.map((x) => (x.id === id ? { ...x, actual, progress: Math.max(0, Math.min(100, Math.round(progress))) } : x)));
  };

  /* ---------------------------------------------------------------- check-ins and feedback */

  const recordCheckIn: PerfStateSlice['recordCheckIn'] = (id, input, actorStaffId) => {
    const c = checkIns.find((x) => x.id === id);
    const actor = person(actorStaffId);
    if (!c || !actor) return fail('Choose who is acting', 'Pick the supervisor holding the check-in.');
    const ap = apFor(c.staffId, c.cycleId);
    if (actor.staffId === c.staffId) return fail('Segregation of duties', 'The supervisor records the check-in, not the employee.');
    if (actor.staffId !== ap?.appraiserId && !isHr(actor)) return fail('Not the supervisor', `${nameOf(c.staffId)}’s check-ins are held by ${nameOf(ap?.appraiserId)}.`);
    if (!input.notes?.trim()) return fail('Notes needed', 'Write what was discussed.');
    setCheckIns((xs) => xs.map((x) => (x.id === id ? { ...x, ...input, heldOn: perfToday, by: actor.fullName } : x)));
    addToast({ type: 'success', title: `Q${c.quarter} check-in recorded`, message: `${nameOf(c.staffId)} — ${input.status === 'ON_TRACK' ? 'on track' : input.status === 'AT_RISK' ? 'at risk' : 'off track'}.` });
    return true;
  };

  const addFeedback: PerfStateSlice['addFeedback'] = (f) => {
    if (!f.staffId || !f.fromStaffId) return fail('Choose people', 'Pick who the feedback is for and who gives it.');
    if (f.staffId === f.fromStaffId) return fail('Not allowed', 'Feedback is given to someone else.');
    if (!f.text.trim()) return fail('Write the feedback', 'Say what happened and its effect.');
    if (f.kind === '360' && !f.rating) return fail('Rating needed', '360° input needs a 1–5 rating.');
    setFeedback((xs) => [{ ...f, text: f.text.trim(), id: nextId(xs.map((x) => x.id), 'FB-'), orgId: person(f.staffId)?.orgId ?? selectedOrgId, on: perfToday }, ...xs]);
    addToast({ type: 'success', title: f.kind === 'RECOGNITION' ? 'Recognition shared' : f.kind === '360' ? '360° input saved' : 'Feedback saved', message: `For ${nameOf(f.staffId)}.` });
    return true;
  };

  /* ---------------------------------------------------------------- appraisal workflow */

  const applyRatings = (staffId: string, cycleId: string, input: AssessInput, who: 'self' | 'sup') =>
    setGoals((xs) =>
      xs.map((x) => (x.staffId === staffId && x.cycleId === cycleId && input.goals[x.id] ? { ...x, [who]: input.goals[x.id].rating, [who === 'self' ? 'selfNote' : 'supNote']: input.goals[x.id].note } : x))
    );
  const compPatch = (ap: Appraisal, input: AssessInput, who: 'self' | 'sup') => {
    const out: Appraisal['competencies'] = { ...ap.competencies };
    COMPETENCIES.forEach((c) => (out[c.id] = { ...out[c.id], [who]: input.comps[c.id] }));
    return out;
  };

  const saveSelfAssessment: PerfStateSlice['saveSelfAssessment'] = (id, input, submit, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    const actor = person(actorStaffId);
    if (!ap || !actor) return fail('Choose who is acting', 'Pick the employee (or HR capturing for them).');
    if (ap.stage !== 'SELF') return fail('Already submitted', 'The self-assessment has moved on.');
    if (actor.staffId !== ap.staffId && !isHr(actor)) return fail('Not allowed', `Only ${nameOf(ap.staffId)} or HR (capturing a paper form) can complete the self-assessment.`);
    const sheet = sheetOf(ap.staffId, ap.cycleId);
    if (submit) {
      if (sheet.some((g) => g.status !== 'APPROVED')) return fail('Goals not approved', 'The supervisor must approve the goal sheet first.');
      if (sheet.some((g) => !input.goals[g.id]?.rating)) return fail('Rate every goal', 'Give each goal a rating from 1 to 5.');
    }
    applyRatings(ap.staffId, ap.cycleId, input, 'self');
    const onBehalf = actor.staffId !== ap.staffId ? ` (captured by ${actor.fullName})` : '';
    if (!submit) {
      setAppraisals((xs) => xs.map((a) => (a.id === id ? { ...a, competencies: compPatch(a, input, 'self'), selfSummary: input.summary } : a)));
      addToast({ type: 'info', title: 'Draft saved', message: 'The self-assessment is saved as a draft.' });
      return true;
    }
    event(id, actor.fullName, `Self-assessment submitted${onBehalf}`, {
      competencies: compPatch(ap, input, 'self'),
      selfSummary: input.summary.trim(),
      selfOn: perfToday,
      selfBy: actor.fullName,
      stage: 'SUPERVISOR'
    });
    addToast({ type: 'success', title: 'Self-assessment submitted', message: `Sent to ${nameOf(ap.appraiserId)} for review.` });
    return true;
  };

  const submitSupervisorReview: PerfStateSlice['submitSupervisorReview'] = (id, input, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    const actor = person(actorStaffId);
    if (!ap || !actor) return fail('Choose who is acting', 'Pick the supervisor.');
    if (ap.stage !== 'SUPERVISOR') return fail('Not at supervisor review', 'This appraisal is at another stage.');
    if (actor.staffId === ap.staffId) return fail('Segregation of duties', 'An employee cannot review their own appraisal.');
    if (actor.staffId !== ap.appraiserId) return fail('Not the supervisor', `${nameOf(ap.staffId)} is reviewed by ${nameOf(ap.appraiserId)}.`);
    const sheet = sheetOf(ap.staffId, ap.cycleId);
    if (sheet.some((g) => !input.goals[g.id]?.rating)) return fail('Rate every goal', 'Give each goal a rating from 1 to 5.');
    if (COMPETENCIES.some((c) => !input.comps[c.id])) return fail('Rate every competency', 'Rate all five core competencies.');
    if (!input.summary.trim()) return fail('Summary needed', 'Write an overall comment for the employee.');
    if (!input.potential) return fail('Potential needed', 'Say whether potential is low, medium or high (used in the 9-box).');
    const goals = sheet.map((g) => ({ ...g, sup: input.goals[g.id]?.rating }));
    const sc = scoreOf(goals, { competencies: compPatch(ap, input, 'sup') }, 'sup', perfSettings);
    const r = ratingOf(sc.total ?? 0);
    applyRatings(ap.staffId, ap.cycleId, input, 'sup');
    const next = ap.hodId ? 'HOD' : 'CALIBRATION';
    event(id, actor.fullName, `Supervisor review submitted — score ${sc.total?.toFixed(2)} (${RATING_SCALE[r].label})`, {
      competencies: compPatch(ap, input, 'sup'),
      supSummary: input.summary.trim(),
      supOn: perfToday,
      supBy: actor.fullName,
      potential: input.potential,
      devNeeds: input.devNeeds.filter((d) => d.skill.trim()),
      stage: next,
      proposedRating: next === 'CALIBRATION' ? r : undefined
    });
    addToast({ type: 'success', title: 'Review submitted', message: next === 'HOD' ? `Sent to ${nameOf(ap.hodId)} for the second-level review.` : 'Sent to HR for calibration.' });
    return true;
  };

  const submitHodReview: PerfStateSlice['submitHodReview'] = (id, input, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    const actor = person(actorStaffId);
    if (!ap || !actor) return fail('Choose who is acting', 'Pick the second-level reviewer.');
    if (ap.stage !== 'HOD') return fail('Not at second-level review', 'This appraisal is at another stage.');
    if (actor.staffId === ap.staffId || actor.staffId === ap.appraiserId) return fail('Segregation of duties', 'The second-level reviewer must be someone other than the employee and the supervisor.');
    if (actor.staffId !== ap.hodId) return fail('Not the reviewer', `The second-level reviewer is ${nameOf(ap.hodId)}.`);
    const sc = scoreOf(sheetOf(ap.staffId, ap.cycleId), ap, 'sup', perfSettings);
    const supRating = ratingOf(sc.total ?? 0);
    if (!input.agree && (!input.rating || !input.comment.trim())) return fail('Reason needed', 'Give the adjusted rating and why.');
    const r = input.agree ? supRating : input.rating!;
    event(id, actor.fullName, input.agree ? 'Second-level review: agreed with the supervisor' : `Second-level review: adjusted ${supRating} → ${r}`, {
      hodRating: input.agree ? undefined : r,
      hodComment: input.comment.trim() || 'Agree with the supervisor’s rating.',
      hodOn: perfToday,
      hodBy: actor.fullName,
      proposedRating: r,
      stage: 'CALIBRATION'
    });
    addToast({ type: 'success', title: 'Second-level review done', message: `${nameOf(ap.staffId)} goes to HR calibration at ${r} (${RATING_SCALE[r].label}).` });
    return true;
  };

  const calibrate: PerfStateSlice['calibrate'] = (id, rating, potential, reason, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    const actor = person(actorStaffId);
    if (!ap || !actor) return fail('Choose who is acting', 'Pick the HR person calibrating.');
    if (!isHr(actor)) return fail('HR only', 'Calibration is done by HR.');
    if (actor.staffId === ap.staffId) return fail('Segregation of duties', 'You cannot calibrate your own rating.');
    if (ap.stage !== 'CALIBRATION') return fail('Not at calibration', 'Only appraisals waiting for calibration can move.');
    const from = { rating: ap.finalRating ?? ap.proposedRating, potential: ap.potential };
    if (from.rating === rating && from.potential === potential) return fail('Nothing changed', 'Pick a different rating or potential.');
    if (!reason.trim()) return fail('Reason needed', 'Every calibration change needs a reason for the record.');
    setCalLog((xs) => [{ id: nextId(xs.map((x) => x.id), 'CAL-'), cycleId: ap.cycleId, staffId: ap.staffId, at: perfToday, by: actor.fullName, from, to: { rating, potential }, reason: reason.trim() }, ...xs]);
    event(id, actor.fullName, `Calibrated: ${from.rating ?? '—'} → ${rating}, potential ${potential.toLowerCase()} (${reason.trim()})`, { finalRating: rating, potential, calibratedBy: actor.fullName, calibratedOn: perfToday });
    addToast({ type: 'success', title: 'Calibration logged', message: `${nameOf(ap.staffId)}: ${RATING_SCALE[rating].label}, ${potential.toLowerCase()} potential.` });
    return true;
  };

  const pipDraftFor = (ap: Appraisal, rating: Rating): PipDraft => {
    const low = sheetOf(ap.staffId, ap.cycleId).filter((g) => (g.sup ?? 3) <= 2);
    return {
      staffId: ap.staffId,
      appraisalId: ap.id,
      cycleId: ap.cycleId,
      reason: `Rated ${rating} (${RATING_SCALE[rating].label}) in the ${perfCycles.find((c) => c.id === ap.cycleId)?.name ?? ''} appraisal.`,
      objectives: (low.length ? low : sheetOf(ap.staffId, ap.cycleId).slice(0, 2)).map((g) => ({ text: `${g.title}: reach ${g.target} ${g.unit}`, measure: g.measure })),
      support: 'Weekly one-to-one with the supervisor; training on the skills behind the missed goals.',
      reviewDates: [30, 60, 90].map((d) => addDays(perfToday, d))
    };
  };

  const buildPip = (d: PipDraft, by: string, ids: string[]): Pip => {
    const ap = d.appraisalId ? appraisals.find((a) => a.id === d.appraisalId) : undefined;
    const e = person(d.staffId);
    return {
      id: nextId(ids, `PIP-${perfToday.slice(0, 4)}-`),
      orgId: e?.orgId ?? selectedOrgId,
      cycleId: d.cycleId,
      staffId: d.staffId,
      appraisalId: d.appraisalId,
      supervisorId: ap?.appraiserId ?? '',
      openedOn: perfToday,
      openedBy: by,
      reason: d.reason.trim(),
      objectives: d.objectives.filter((o) => o.text.trim()).map((o, i) => ({ id: `o${i + 1}`, text: o.text.trim(), measure: o.measure.trim(), status: 'OPEN' })),
      support: d.support.trim(),
      reviews: [...d.reviewDates].sort().map((due) => ({ due })),
      endDate: [...d.reviewDates].sort().slice(-1)[0],
      status: 'ACTIVE',
      history: [{ at: perfToday, by, text: 'Plan opened' }]
    };
  };

  const releaseRatings: PerfStateSlice['releaseRatings'] = (ids, actorStaffId) => {
    const actor = person(actorStaffId);
    if (!isHr(actor)) {
      fail('HR only', 'Ratings are released by HR after calibration.');
      return 0;
    }
    const list = appraisals.filter((a) => ids.includes(a.id) && a.stage === 'CALIBRATION' && (a.finalRating ?? a.proposedRating));
    const own = list.filter((a) => a.staffId === actor!.staffId);
    const go = list.filter((a) => a.staffId !== actor!.staffId);
    if (own.length) addToast({ type: 'warning', title: 'Own rating skipped', message: `${actor!.fullName} cannot release their own rating — another HR person must.` });
    if (!go.length) return 0;
    const newPips: Pip[] = [];
    const pipIds = pips.map((p) => p.id);
    for (const a of go) {
      const r = (a.finalRating ?? a.proposedRating)!;
      const hasPlan = pips.some((p) => p.staffId === a.staffId && (p.status === 'ACTIVE' || p.status === 'EXTENDED'));
      if (r <= perfSettings.pipAtOrBelow && !hasPlan) {
        const p = buildPip(pipDraftFor(a, r), actor!.fullName, [...pipIds, ...newPips.map((x) => x.id)]);
        newPips.push(p);
      }
    }
    setAppraisals((xs) =>
      xs.map((a) => {
        const hit = go.find((g) => g.id === a.id);
        if (!hit) return a;
        const r = (a.finalRating ?? a.proposedRating)!;
        const pip = newPips.find((p) => p.staffId === a.staffId);
        return {
          ...a,
          finalRating: r,
          calibratedBy: a.calibratedBy ?? actor!.fullName,
          calibratedOn: a.calibratedOn ?? perfToday,
          releasedOn: perfToday,
          stage: 'ACKNOWLEDGEMENT',
          timeline: [
            ...a.timeline,
            { at: perfToday, by: actor!.fullName, text: `Rating ${r} (${RATING_SCALE[r].label}) released to the employee` },
            ...(pip ? [{ at: perfToday, by: actor!.fullName, text: `Improvement plan ${pip.id} opened` }] : [])
          ]
        };
      })
    );
    if (newPips.length) setPips((xs) => [...newPips, ...xs]);
    audit(actor!.fullName, `${go.length} calibrated rating${go.length > 1 ? 's' : ''} released`);
    addToast({
      type: 'success',
      title: `${go.length} rating${go.length > 1 ? 's' : ''} released`,
      message: `Employees can now acknowledge.${newPips.length ? ` ${newPips.length} improvement plan${newPips.length > 1 ? 's' : ''} opened for ratings of ${perfSettings.pipAtOrBelow} or below.` : ''}`
    });
    return go.length;
  };

  const acknowledgeAppraisal: PerfStateSlice['acknowledgeAppraisal'] = (id, agree, comment, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    if (!ap) return false;
    if (ap.stage !== 'ACKNOWLEDGEMENT') return fail('Not waiting for acknowledgement', 'The rating has not been released yet.');
    if (actorStaffId !== ap.staffId) return fail('Employee only', `Only ${nameOf(ap.staffId)} can acknowledge their appraisal.`);
    if (!agree && !comment.trim()) return fail('Comment needed', 'Say why you disagree — HR will review it.');
    event(id, nameOf(ap.staffId), agree ? 'Acknowledged and agreed' : 'Disagreed with the rating — sent to HR', {
      ack: { on: perfToday, by: nameOf(ap.staffId), agree, comment: comment.trim() || undefined },
      stage: agree ? 'CLOSED' : 'DISPUTED'
    });
    addToast({ type: agree ? 'success' : 'warning', title: agree ? 'Appraisal acknowledged' : 'Dispute raised', message: agree ? 'The appraisal is closed.' : 'HR will review the rating and reply.' });
    return true;
  };

  const resolveDispute: PerfStateSlice['resolveDispute'] = (id, resolution, rating, note, actorStaffId) => {
    const ap = appraisals.find((a) => a.id === id);
    const actor = person(actorStaffId);
    if (!ap || !actor) return fail('Choose who is acting', 'Pick the HR person.');
    if (ap.stage !== 'DISPUTED') return fail('No open dispute', 'This appraisal is not disputed.');
    if (!isHr(actor)) return fail('HR only', 'Disputes are decided by HR.');
    if ([ap.staffId, ap.appraiserId].includes(actor.staffId)) return fail('Segregation of duties', 'The employee and the supervisor cannot decide the dispute.');
    if (!note.trim()) return fail('Reason needed', 'Explain the decision to the employee.');
    if (resolution === 'REVISED' && (!rating || rating === ap.finalRating)) return fail('Choose the new rating', 'A revised rating must differ from the current one.');
    const from = ap.finalRating!;
    const to = resolution === 'REVISED' ? rating! : from;
    if (resolution === 'REVISED')
      setCalLog((xs) => [{ id: nextId(xs.map((x) => x.id), 'CAL-'), cycleId: ap.cycleId, staffId: ap.staffId, at: perfToday, by: actor.fullName, from: { rating: from, potential: ap.potential }, to: { rating: to, potential: ap.potential ?? 'MEDIUM' }, reason: `Dispute: ${note.trim()}` }, ...xs]);
    event(id, actor.fullName, resolution === 'REVISED' ? `Dispute upheld for the employee: rating ${from} → ${to}` : 'Dispute reviewed: rating stands', {
      dispute: { resolution, note: note.trim(), by: actor.fullName, on: perfToday, from },
      finalRating: to,
      stage: 'CLOSED'
    });
    addToast({ type: 'success', title: 'Dispute closed', message: `${nameOf(ap.staffId)}: ${resolution === 'REVISED' ? `revised to ${to}` : `rating ${from} stands`}.` });
    return true;
  };

  const markNeedsSent: PerfStateSlice['markNeedsSent'] = (id, skills) =>
    setAppraisals((xs) => xs.map((a) => (a.id === id ? { ...a, devNeeds: a.devNeeds.map((d) => (skills.includes(d.skill) ? { ...d, sentOn: perfToday } : d)) } : a)));

  /* ---------------------------------------------------------------- rewards */

  const prepareRewardRun: PerfStateSlice['prepareRewardRun'] = (cycleId, opts, actorStaffId) => {
    const actor = person(actorStaffId);
    const cycle = perfCycles.find((c) => c.id === cycleId);
    if (!cycle) return null;
    if (!isHr(actor)) return (fail('HR only', 'Reward proposals are prepared by HR.'), null);
    if (opts.bonusPeriod < payrollOpenPeriod.key || opts.meritEffective < payrollOpenPeriod.key)
      return (fail('Period closed', `Bonuses and increases start from ${payrollOpenPeriod.label} or later — paid months cannot change.`), null);
    const taken = new Set(rewardRuns.filter((r) => r.cycleId === cycleId && r.status !== 'REJECTED').flatMap((r) => r.lines.map((l) => l.staffId)));
    const due = appraisals.filter((a) => a.cycleId === cycleId && !taken.has(a.staffId) && rewardEligible(a, person(a.staffId)));
    if (!due.length) return (fail('Nobody to reward yet', 'Ratings must be calibrated and released before rewards are proposed.'), null);
    const p = monthKey(opts.meritEffective);
    const lines = due.map((a) => {
      const e = person(a.staffId)!;
      const base = rewardFor(e, a.finalRating!, perfSettings, cycle, p);
      return { ...base, ...rewardCost(e, base, payrollCtx, p) };
    });
    const annual = lines.reduce((n, l) => n + l.basic * 12, 0);
    const budget = { merit: Math.round((annual * perfSettings.meritBudgetPct) / 100), bonus: Math.round((annual * perfSettings.bonusPoolPct) / 100) };
    const meritSpend = lines.reduce((n, l) => n + (l.newBasic - l.basic) * 12, 0);
    const bonusSpend = lines.reduce((n, l) => n + l.bonus, 0);
    const run: RewardRun = {
      id: nextId(rewardRuns.map((r) => r.id), `RWD-${cycle.periodEnd.slice(0, 4)}-`),
      cycleId,
      orgId: cycle.orgId,
      preparedBy: actor!.fullName,
      preparedOn: perfToday,
      bonusPeriod: opts.bonusPeriod,
      meritEffective: opts.meritEffective,
      lines,
      budget,
      overBudget: meritSpend > budget.merit || bonusSpend > budget.bonus,
      approvals: [],
      status: 'PENDING_HR'
    };
    setRuns((xs) => [run, ...xs]);
    audit(actor!.fullName, `Reward proposal ${run.id} prepared for ${lines.length} people`);
    addToast({ type: 'success', title: `Reward proposal ${run.id}`, message: `${lines.length} people. Next: HR approval, then Finance${run.overBudget ? ', then the managing director (over budget)' : ''}.` });
    return run;
  };

  const adjustRewardLine: PerfStateSlice['adjustRewardLine'] = (runId, staffId, patch, note) => {
    const run = rewardRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'PENDING_HR') return fail('Locked', 'Lines can only change before HR approves the proposal.');
    if (!note.trim()) return fail('Reason needed', 'Say why the line differs from the matrix.');
    const e = person(staffId);
    if (!e) return false;
    const p = monthKey(run.meritEffective);
    const lines = run.lines.map((l) => {
      if (l.staffId !== staffId) return l;
      const newBasic = Math.max(l.basic, Math.round(patch.newBasic ?? l.newBasic));
      const bonus = Math.max(0, Math.round(patch.bonus ?? l.bonus));
      const next = { ...l, newBasic, bonus, meritPct: l.basic ? Math.round(((newBasic - l.basic) / l.basic) * 1000) / 10 : 0, note: note.trim() };
      return { ...next, ...rewardCost(e, next, payrollCtx, p) };
    });
    const meritSpend = lines.reduce((n, l) => n + (l.newBasic - l.basic) * 12, 0);
    const bonusSpend = lines.reduce((n, l) => n + l.bonus, 0);
    setRuns((xs) => xs.map((r) => (r.id === runId ? { ...r, lines, overBudget: meritSpend > r.budget.merit || bonusSpend > r.budget.bonus } : r)));
    return true;
  };

  const applyRun = (run: RewardRun, by: string) => {
    const cycle = perfCycles.find((c) => c.id === run.cycleId);
    const items = run.lines
      .filter((l) => l.bonus > 0)
      .map((l) => ({
        staffId: l.staffId,
        componentId: 'BONUS',
        amount: l.bonus,
        period: run.bonusPeriod,
        recurring: false,
        reference: `${cycle?.name ?? 'Annual'} performance bonus — rating ${l.rating}`,
        note: `${run.id}${l.prorata < 1 ? ` · pro-rated ${Math.round(l.prorata * 12)}/12` : ''}`,
        source: 'Bulk' as const
      }));
    const posted = items.length ? postPayItems(items, by) : 0;
    if (items.length && !posted) return null;
    const p = monthKey(run.meritEffective);
    let increments = 0;
    for (const l of run.lines) {
      const e = person(l.staffId);
      if (!e || l.newBasic <= l.basic) continue;
      const previous = basicFor(e, p.year, p.month);
      if (l.newBasic <= previous) continue;
      increments++;
      updateHrEmployee(l.staffId, {
        basicSalaryKes: l.newBasic,
        salaryHistory: [...(e.salaryHistory ?? []), { effectiveFrom: run.meritEffective, basic: l.newBasic, previous, reason: `Merit increase ${l.meritPct}% — ${cycle?.name ?? ''} rating ${l.rating}`, ref: run.id, by }],
        history: [...(e.history ?? []), { date: `${run.meritEffective}-01`, kind: 'Merit increase', summary: `KES ${previous.toLocaleString()} → ${l.newBasic.toLocaleString()} (+${l.meritPct}%)`, ref: run.id, by }]
      });
    }
    return { posted, increments };
  };

  const decideRewardRun: PerfStateSlice['decideRewardRun'] = (runId, approve, actorStaffId, comment) => {
    const run = rewardRuns.find((r) => r.id === runId);
    const actor = person(actorStaffId);
    if (!run || !actor) return fail('Choose who is acting', 'Pick the approver.');
    const step: RewardStep | undefined = run.status === 'PENDING_HR' ? 'HR' : run.status === 'PENDING_FINANCE' ? 'FINANCE' : run.status === 'PENDING_MD' ? 'MD' : undefined;
    if (!step) return fail('Already decided', `${run.id} is ${run.status.toLowerCase().replace('_', ' ')}.`);
    if (step === 'HR' && !isHr(actor)) return fail('HR approval', 'The first approval is by HR.');
    if (step === 'FINANCE' && !isFinance(actor)) return fail('Finance approval', 'The finance director or finance manager approves next.');
    if (step === 'MD' && !isMd(actor)) return fail('Managing director approval', 'The proposal is over budget, so the managing director must approve.');
    if (run.lines.some((l) => l.staffId === actor.staffId)) return fail('Segregation of duties', `${actor.fullName} is in this proposal and cannot approve it.`);
    if (run.approvals.some((a) => a.by === actor.fullName)) return fail('Segregation of duties', `${actor.fullName} already approved an earlier step.`);
    if (step === 'HR' && run.preparedBy === actor.fullName) return fail('Segregation of duties', `${actor.fullName} prepared ${run.id}; another HR person must approve it.`);
    if (!approve && !comment?.trim()) return fail('Reason needed', 'Say why the proposal is rejected.');
    const approvals = [...run.approvals, { step, by: actor.fullName, on: perfToday, approve, comment: comment?.trim() || undefined }];
    if (!approve) {
      setRuns((xs) => xs.map((r) => (r.id === runId ? { ...r, approvals, status: 'REJECTED' } : r)));
      addToast({ type: 'info', title: `${run.id} rejected`, message: 'Nothing was posted. HR can prepare a new proposal.' });
      return true;
    }
    const last = step === 'MD' || (step === 'FINANCE' && !run.overBudget);
    if (!last) {
      setRuns((xs) => xs.map((r) => (r.id === runId ? { ...r, approvals, status: step === 'HR' ? 'PENDING_FINANCE' : 'PENDING_MD' } : r)));
      addToast({ type: 'success', title: 'Approved', message: `${run.id} goes to ${step === 'HR' ? 'Finance' : 'the managing director'}.` });
      return true;
    }
    if (run.bonusPeriod < payrollOpenPeriod.key || run.meritEffective < payrollOpenPeriod.key)
      return fail('Payroll period closed', `${fmtDate(run.bonusPeriod)} has been paid. Reject this proposal and prepare it again from ${payrollOpenPeriod.label}.`);
    const res = applyRun(run, actor.fullName);
    if (!res) return false;
    setRuns((xs) => xs.map((r) => (r.id === runId ? { ...r, approvals, status: 'APPLIED', appliedOn: perfToday, postedItems: res.posted, increments: res.increments } : r)));
    audit(actor.fullName, `${run.id} approved and sent to payroll`);
    const bonus = run.lines.reduce((n, l) => n + l.bonus, 0);
    addToast({
      type: 'success',
      title: `${run.id} sent to payroll`,
      message: `${res.posted} bonuses (${kes(bonus)}) in ${fmtDate(run.bonusPeriod)} payroll; ${res.increments} increases from ${fmtDate(run.meritEffective)}. Paid months are unchanged.`
    });
    return true;
  };

  /* ---------------------------------------------------------------- improvement plans */

  const pipActorOk = (staffId: string, supervisorId: string, actor?: HREmployee) => {
    if (!actor) return fail('Choose who is acting', 'Pick the supervisor or HR.');
    if (actor.staffId === staffId) return fail('Segregation of duties', 'Employees cannot manage their own improvement plan.');
    if (actor.staffId !== supervisorId && !isHr(actor)) return fail('Not allowed', `Only ${nameOf(supervisorId)} or HR can do this.`);
    return true;
  };

  const openPip: PerfStateSlice['openPip'] = (draft, actorStaffId) => {
    const actor = person(actorStaffId);
    const ap = draft.appraisalId ? appraisals.find((a) => a.id === draft.appraisalId) : appraisals.find((a) => a.staffId === draft.staffId);
    if (!pipActorOk(draft.staffId, ap?.appraiserId ?? '', actor)) return null;
    if (pips.some((p) => p.staffId === draft.staffId && (p.status === 'ACTIVE' || p.status === 'EXTENDED'))) return (fail('Plan already open', `${nameOf(draft.staffId)} already has an open plan.`), null);
    if (!draft.reason.trim()) return (fail('Reason needed', 'Say why the plan is needed.'), null);
    if (!draft.objectives.some((o) => o.text.trim())) return (fail('Objectives needed', 'Add at least one objective.'), null);
    if (!draft.reviewDates.length || draft.reviewDates.some((d) => d <= perfToday)) return (fail('Review dates', 'Add review dates after today.'), null);
    const p = buildPip({ ...draft, appraisalId: draft.appraisalId ?? ap?.id }, actor!.fullName, pips.map((x) => x.id));
    setPips((xs) => [p, ...xs]);
    addToast({ type: 'success', title: `Plan ${p.id} opened`, message: `${nameOf(p.staffId)}: first review ${fmtDate(p.reviews[0]?.due)}.` });
    return p;
  };

  const recordPipReview: PerfStateSlice['recordPipReview'] = (id, index, note, objectives, actorStaffId) => {
    const p = pips.find((x) => x.id === id);
    if (!p || !pipActorOk(p.staffId, p.supervisorId, person(actorStaffId))) return false;
    if (!['ACTIVE', 'EXTENDED'].includes(p.status)) return fail('Plan closed', 'The plan has an outcome already.');
    if (!note.trim()) return fail('Notes needed', 'Record what was reviewed.');
    const by = nameOf(actorStaffId);
    setPips((xs) =>
      xs.map((x) =>
        x.id === id
          ? {
              ...x,
              reviews: x.reviews.map((r, i) => (i === index ? { ...r, heldOn: perfToday, note: note.trim(), by } : r)),
              objectives: x.objectives.map((o) => ({ ...o, status: objectives[o.id] ?? o.status })),
              history: [...x.history, { at: perfToday, by, text: `Review of ${fmtDate(x.reviews[index]?.due)} held` }]
            }
          : x
      )
    );
    addToast({ type: 'success', title: 'Review recorded', message: `${nameOf(p.staffId)} — ${p.id}.` });
    return true;
  };

  const closePip: PerfStateSlice['closePip'] = (id, outcome, note, actorStaffId, extendTo) => {
    const p = pips.find((x) => x.id === id);
    const actor = person(actorStaffId);
    if (!p || !pipActorOk(p.staffId, p.supervisorId, actor)) return false;
    if (!['ACTIVE', 'EXTENDED'].includes(p.status)) return fail('Plan closed', 'The plan has an outcome already.');
    if (!note.trim()) return fail('Reason needed', 'Record why.');
    if (!p.reviews.some((r) => r.heldOn)) return fail('No review yet', 'Hold at least one review before deciding the outcome.');
    if (outcome === 'EXTENDED') {
      if (!extendTo || extendTo <= p.endDate) return fail('New end date', `Pick a date after ${fmtDate(p.endDate)}.`);
      setPips((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'EXTENDED', endDate: extendTo, reviews: [...x.reviews, { due: extendTo }], history: [...x.history, { at: perfToday, by: actor!.fullName, text: `Extended to ${fmtDate(extendTo)}: ${note.trim()}` }] } : x)));
      addToast({ type: 'info', title: 'Plan extended', message: `${nameOf(p.staffId)} until ${fmtDate(extendTo)}.` });
      return true;
    }
    let caseId: string | undefined;
    if (outcome === 'REFERRED') {
      const missed = p.objectives.filter((o) => o.status !== 'MET').map((o) => o.text);
      const c = raiseCase({
        staffId: p.staffId,
        category: 'POOR_PERFORMANCE',
        summary: `Improvement plan ${p.id} (opened ${fmtDate(p.openedOn)}) not met. ${missed.length ? `Objectives not met: ${missed.join('; ')}.` : ''} ${note.trim()}`.trim(),
        incidentDate: perfToday
      });
      caseId = c.id;
    }
    setPips((xs) =>
      xs.map((x) =>
        x.id === id
          ? { ...x, status: outcome, outcome: { on: perfToday, by: actor!.fullName, note: note.trim(), caseId }, history: [...x.history, { at: perfToday, by: actor!.fullName, text: outcome === 'REFERRED' ? `Referred to disciplinary (${caseId})` : 'Closed — successful' }] }
          : x
      )
    );
    if (outcome === 'SUCCESSFUL') addToast({ type: 'success', title: 'Plan closed', message: `${nameOf(p.staffId)} completed the plan successfully.` });
    return true;
  };

  return {
    perfToday,
    perfSettings,
    perfCycles,
    orgGoals,
    perfGoals,
    appraisals,
    checkIns,
    perfFeedback,
    calibrationLog,
    rewardRuns,
    pips,
    priorRatings,
    perfAudit,
    updatePerfSettings,
    saveGoal,
    removeGoal,
    submitGoals,
    decideGoals,
    updateGoalProgress,
    recordCheckIn,
    addFeedback,
    saveSelfAssessment,
    submitSupervisorReview,
    submitHodReview,
    calibrate,
    releaseRatings,
    acknowledgeAppraisal,
    resolveDispute,
    markNeedsSent,
    prepareRewardRun,
    adjustRewardLine,
    decideRewardRun,
    openPip,
    recordPipReview,
    closePip
  };
};
