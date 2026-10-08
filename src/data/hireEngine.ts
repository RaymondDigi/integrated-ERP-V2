/* Hire module logic: establishment and budget checks, approval routing, screening, scorecards, offers, onboarding and employee changes. */
import type { EmployeeRequisition, HREmployee, JobApplicant, OnboardingRecord } from '../types';
import { allowances, basicFor, isCasual, periodKey } from './payrollEngine';
import { computeStatutory } from '../utils/statutory';
import { hrApproverFor, supervisorFor } from './leaveConfig';
import {
  CLOSED_STAGES,
  DAYS_PER_MONTH,
  FINANCE_THRESHOLD_KES,
  GRADE_BANDS,
  OFFER_MIN_SCORE,
  REQUIRED_CHECKS,
  onboardingTemplate,
  sessionTemplate,
  type BackgroundCheck,
  type Criterion,
  type EstablishmentPlan,
  type HireTerms,
  type Interview,
  type OnboardingTask,
  type PipelineStage,
  type ReqStep,
  type Vacancy
} from './hireConfig';

/* ------------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
export const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoOf(d);
};
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000);
export const fmtDate = (iso?: string) => (iso ? new Date(iso.length === 7 ? iso + '-01T00:00:00' : iso + 'T00:00:00').toLocaleDateString('en-GB', iso.length === 7 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
/** Demo reveal: fills the masked part with a stable pattern. Real reveals come from the vault and are logged. */
export const reveal = (masked: string, on: boolean) => (on ? masked.replace(/\*+/g, (m) => '7392815640'.slice(0, m.length)) : masked);

/* ------------------------------------------------------------------ grades and cost */

export const bandOf = (grade: string) => GRADE_BANDS.find((b) => b.grade === grade) ?? GRADE_BANDS.find((b) => grade.startsWith(b.grade.slice(0, 5)));
export const gradeFor = (basic: number) => (GRADE_BANDS.find((b) => basic <= b.max) ?? GRADE_BANDS[GRADE_BANDS.length - 1]).grade;
export const gradeOf = (e: HREmployee) => e.grade ?? (isCasual(e) ? GRADE_BANDS[0].grade : gradeFor(e.basicSalaryKes));
export const shortGrade = (g: string) => g.split(' ')[0];

/** Where a salary sits against its grade band. */
export const bandPosition = (basic: number, grade: string): 'below' | 'within' | 'above' => {
  const b = bandOf(grade);
  if (!b) return 'within';
  return basic < b.min ? 'below' : basic > b.max ? 'above' : 'within';
};

export interface MonthlyCost {
  gross: number;
  employerNssf: number;
  employerAhl: number;
  nita: number;
  total: number;
}

/** Monthly cost to the company of a salary: basic, house and transport allowance plus employer NSSF, housing levy and NITA. */
export const monthlyCost = (basic: number, date = todayIso(), dailyRate?: number): MonthlyCost => {
  const a = allowances(basic);
  const gross = basic > 0 ? basic + a.house + a.transport : (dailyRate ?? 0) * DAYS_PER_MONTH;
  if (!gross) return { gross: 0, employerNssf: 0, employerAhl: 0, nita: 0, total: 0 };
  const s = computeStatutory({ cashGross: gross, date });
  return { gross, employerNssf: s.nssfEr, employerAhl: s.ahlEr, nita: s.nita, total: gross + s.nssfEr + s.ahlEr + s.nita };
};
export const annualCost = (basic: number, date?: string, dailyRate?: number) => monthlyCost(basic, date, dailyRate).total * 12;

/** Annual cost of someone already in post, at the salary payroll uses this month. */
export const employeeAnnualCost = (e: HREmployee, today = new Date()) =>
  isCasual(e) ? annualCost(0, isoOf(today), e.payRateKes) : annualCost(basicFor(e, today.getFullYear(), today.getMonth()), isoOf(today));

/** Annual cost of every position on a requisition. Daily-rated lines carry the daily rate in monthlySalaryKes when it is below 5,000. */
export const requisitionCost = (r: Pick<EmployeeRequisition, 'lines' | 'estimatedBudgetKes' | 'headcountRequired'>) => {
  const lines = r.lines?.length ? r.lines : [{ monthlySalaryKes: r.estimatedBudgetKes / Math.max(1, r.headcountRequired), headcount: r.headcountRequired }];
  return lines.reduce((n, l) => n + l.headcount * (l.monthlySalaryKes < 5_000 ? annualCost(0, undefined, l.monthlySalaryKes) : annualCost(l.monthlySalaryKes)), 0);
};

/* ------------------------------------------------------------------ people */

const active = (e: HREmployee) => e.status !== 'TERMINATED';

/** Head of a department: the person the leave workflow sends that department's requests to. */
export const deptHead = (orgId: string, department: string, all: HREmployee[]) =>
  supervisorFor({ staffId: '__new__', orgId, department, jobTitle: '' } as HREmployee, all);

export const hrOfficer = (orgId: string, all: HREmployee[]) => hrApproverFor(orgId, all) ?? all.find((e) => e.orgId === orgId && /\bHR\b/.test(e.jobTitle) && active(e));

const financeApprovers = (orgId: string, all: HREmployee[]) => {
  const inOrg = all.filter((e) => e.orgId === orgId && active(e) && /finance (manager|director)|accountant/i.test(e.jobTitle));
  const rank = (e: HREmployee) => (/manager/i.test(e.jobTitle) ? 0 : /director/i.test(e.jobTitle) ? 1 : 2);
  return inOrg.sort((a, b) => rank(a) - rank(b));
};

const mdApprovers = (orgId: string, all: HREmployee[]) => {
  const md = /managing director|chief executive|general manager/i;
  return [...all.filter((e) => e.orgId === orgId && active(e) && md.test(e.jobTitle)), ...all.filter((e) => e.orgId !== orgId && active(e) && /group managing director/i.test(e.jobTitle))];
};

/** Who can decide a step, in order of preference. The first one not excluded (requester or earlier approver) gets it. */
export const approverCandidates = (step: ReqStep, r: Pick<EmployeeRequisition, 'orgId' | 'department'>, all: HREmployee[]) => {
  const head = deptHead(r.orgId, r.department, all);
  const list: (HREmployee | undefined)[] =
    step === 'HOD'
      ? [head, head && supervisorFor(head, all)]
      : step === 'HR'
      ? [hrOfficer(r.orgId, all), all.find((e) => e.orgId === 'org-nairobi' && /HR Manager/i.test(e.jobTitle))]
      : step === 'FINANCE'
      ? financeApprovers(r.orgId, all)
      : mdApprovers(r.orgId, all);
  return list.filter((x, i, xs): x is HREmployee => !!x && xs.findIndex((y) => y?.staffId === x.staffId) === i);
};

/** Segregation of duties: the requester and anyone who already approved cannot take a later step. */
export const approverFor = (step: ReqStep, r: EmployeeRequisition, all: HREmployee[]) => {
  const excluded = new Set([r.requesterStaffId, ...(r.approvals ?? []).filter((a) => a.action === 'APPROVED').map((a) => a.byStaffId)].filter(Boolean));
  return approverCandidates(step, r, all).find((e) => !excluded.has(e.staffId));
};

/** Next staff ID in the company's series (CAS- for daily-rated staff). */
export const nextStaffIdFor = (orgId: string, all: HREmployee[], casual: boolean) => {
  const inOrg = all.filter((e) => e.orgId === orgId && !e.staffId.startsWith('CAS-'));
  const counts = new Map<string, number>();
  inOrg.forEach((e) => {
    const p = e.staffId.split('-')[0];
    counts.set(p, (counts.get(p) ?? 0) + 1);
  });
  const prefix = casual ? 'CAS' : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EMP';
  const max = all.filter((e) => e.staffId.startsWith(prefix + '-')).reduce((m, e) => Math.max(m, Number(e.staffId.split('-')[1]) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

export const workEmail = (fullName: string, casual: boolean) => {
  const parts = fullName.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
  return `${parts[0]?.[0] ?? 'x'}.${parts[parts.length - 1] ?? 'staff'}@${casual ? 'ops.' : ''}intergrated-erp.ke`;
};

/* Masking: only the masked form reaches the employee master */
const keep = (s: string, head: number, tail: number, stars = 5) => {
  const t = s.replace(/\s+/g, '');
  return t.length <= head + tail ? '*'.repeat(stars) : `${t.slice(0, head)}${'*'.repeat(stars)}${t.slice(-tail)}`;
};
export const maskId = (s: string) => keep(s, 2, 1);
export const maskKra = (s: string) => keep(s.toUpperCase(), 3, 1);
export const maskNssf = (s: string) => keep(s, 3, 1, 4);
export const maskShif = (s: string) => `SHIF-****-${s.replace(/\D/g, '').slice(-3).padStart(3, '0')}`;
export const maskAccount = (bank: string, acc: string) => `${bank.replace(/ Bank( Kenya)?$/, '')} ${keep(acc, 2, 3, 4)}`;
export const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, '').replace(/^0/, '254');
  return d.length >= 12 ? `+${d.slice(0, 3)} ${d.slice(3, 6)} *** ${d.slice(-3)}` : keep(p, 4, 3, 3);
};

export const KRA_PIN_RE = /^[AP]\d{9}[A-Z]$/i;

/* ------------------------------------------------------------------ establishment */

export interface EstablishmentRow {
  department: string;
  approved: number;
  inPost: number;
  joining: number;
  open: number;
  pending: number;
  vacant: number;
  budgetKes: number;
  costInPost: number;
  committed: number;
  headroom: number;
  plan?: EstablishmentPlan;
}

/** Positions still to fill on an approved requisition (accepted offers count as filled). */
export const positionsLeft = (r: EmployeeRequisition, candidates: JobApplicant[]) => {
  if (r.status === 'FILLED') return 0;
  const hired = candidates.filter((c) => c.vacancyId && c.vacancyId === r.vacancyId && c.stage === 'Hired').length;
  return Math.max(0, r.headcountRequired - hired);
};

export const establishmentRows = (
  orgId: string,
  employees: HREmployee[],
  requisitions: EmployeeRequisition[],
  candidates: JobApplicant[],
  onboarding: OnboardingRecord[],
  plans: EstablishmentPlan[],
  today = new Date()
): EstablishmentRow[] => {
  const staff = employees.filter((e) => e.orgId === orgId && active(e) && !(e.exitDate && e.exitDate < isoOf(today)));
  const reqs = requisitions.filter((r) => r.orgId === orgId);
  const joiningRecs = onboarding.filter((o) => o.orgId === orgId && o.status === 'PRE_BOARDING' && o.terms);
  const depts = [...new Set([...plans.filter((p) => p.orgId === orgId).map((p) => p.department), ...staff.map((e) => e.department), ...reqs.map((r) => r.department)])];
  return depts
    .map((department) => {
      const plan = plans.find((p) => p.orgId === orgId && p.department === department);
      const inDept = staff.filter((e) => e.department === department);
      const joining = joiningRecs.filter((o) => (o.terms?.department ?? o.department) === department);
      const live = reqs.filter((r) => r.department === department && (r.status === 'APPROVED' || r.status === 'IN_RECRUITMENT'));
      const open = live.reduce((n, r) => n + positionsLeft(r, candidates), 0);
      const pendingReqs = reqs.filter((r) => r.department === department && r.status === 'PENDING_APPROVAL');
      const pending = pendingReqs.reduce((n, r) => n + r.headcountRequired, 0);
      const costInPost = inDept.reduce((n, e) => n + employeeAnnualCost(e, today), 0);
      const committed =
        joining.reduce((n, o) => n + annualCost(o.terms!.basic, undefined, o.terms!.dailyRate), 0) +
        live.reduce((n, r) => n + (requisitionCost(r) / Math.max(1, r.headcountRequired)) * positionsLeft(r, candidates), 0);
      const approved = plan?.approved ?? inDept.length + joining.length + open;
      const budgetKes = plan?.budgetKes ?? Math.round((costInPost + committed) * 1.05);
      return {
        department,
        approved,
        inPost: inDept.length,
        joining: joining.length,
        open,
        pending,
        vacant: approved - inDept.length - joining.length - open,
        budgetKes,
        costInPost,
        committed,
        headroom: budgetKes - costInPost - committed,
        plan
      };
    })
    .sort((a, b) => b.inPost - a.inPost);
};

export interface BudgetCheck {
  annualCost: number;
  row?: EstablishmentRow;
  overEstablishment: boolean;
  overBudget: boolean;
  /** Positions above the approved establishment */
  excessPositions: number;
  headroomAfter: number;
  steps: ReqStep[];
}

/** Budget and establishment check that decides whether Finance has to sign off. */
export const budgetCheck = (r: Pick<EmployeeRequisition, 'department' | 'headcountRequired' | 'lines' | 'estimatedBudgetKes' | 'status'>, rows: EstablishmentRow[]): BudgetCheck => {
  const row = rows.find((x) => x.department === r.department);
  const cost = requisitionCost(r);
  // Pending requisitions are not committed, so each is checked against the same free positions
  const free = row?.vacant ?? 0;
  const excess = Math.max(0, r.headcountRequired - Math.max(0, free));
  const headroomAfter = (row?.headroom ?? 0) - cost;
  const overEstablishment = excess > 0;
  const overBudget = headroomAfter < 0;
  const steps: ReqStep[] = ['HOD', 'HR'];
  if (overEstablishment || overBudget || cost > FINANCE_THRESHOLD_KES) steps.push('FINANCE');
  steps.push('MD');
  return { annualCost: cost, row, overEstablishment, overBudget, excessPositions: excess, headroomAfter, steps };
};

/** Job advert drafted from the requisition and its job description. */
export const draftAd = (r: EmployeeRequisition, companyName: string, closingDate: string) => {
  const line = r.lines?.[0];
  const jd = line?.jobDescription;
  const parts = [
    `${companyName} is recruiting ${r.headcountRequired > 1 ? `${r.headcountRequired} ` : 'a '}${r.title.replace(/ \+ \d+ more.*$/, '')}${r.headcountRequired > 1 ? 's' : ''} for the ${r.department} department at ${r.branch}.`,
    jd?.jobPurpose ? `Purpose of the role: ${jd.jobPurpose}` : r.justification ? `About the role: ${r.justification}` : '',
    jd?.responsibilities?.length ? `Key responsibilities:\n${jd.responsibilities.map((x) => `• ${x}`).join('\n')}` : '',
    jd ? `Requirements: ${jd.educationLevel}${jd.minExperienceYears ? `, at least ${jd.minExperienceYears} years' relevant experience` : ''}${jd.skills?.length ? `; ${jd.skills.join(', ')}` : ''}.` : '',
    `Grade ${shortGrade(r.gradeScale)}. Applications close on ${fmtDate(closingDate)}. Only shortlisted candidates will be contacted. We do not charge any fee at any stage of recruitment.`
  ];
  return parts.filter(Boolean).join('\n\n');
};

/* ------------------------------------------------------------------ pipeline */

const LEGACY: Record<string, PipelineStage> = { Screening: 'Screened', 'Aptitude Test': 'Assessment', 'Panel Interview': 'Interview', 'Offer Issued': 'Offer' };
export const stageOf = (a: JobApplicant): PipelineStage => (LEGACY[a.stage] ?? a.stage) as PipelineStage;
export const isOpenStage = (s: PipelineStage) => !CLOSED_STAGES.includes(s);

/** Where a candidate can move from each stage (rejection and withdrawal are always possible while open). */
export const NEXT_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  Applied: 'Screened',
  Screened: 'Shortlisted',
  Shortlisted: 'Interview',
  Interview: 'Assessment',
  Assessment: 'Offer',
  Offer: 'Hired'
};

export interface ScreenResult {
  pass: boolean;
  failures: string[];
  unanswered: string[];
}

export const screen = (a: JobApplicant, v?: Vacancy): ScreenResult => {
  if (!v) return { pass: true, failures: [], unanswered: [] };
  const failures: string[] = [];
  const unanswered: string[] = [];
  if (a.experienceYears < v.minYears) failures.push(`${a.experienceYears} years' experience; the role needs ${v.minYears}`);
  v.knockouts.forEach((k) => {
    const ans = a.answers?.[k.id];
    if (ans === undefined) unanswered.push(k.question);
    else if (ans !== k.expected) failures.push(k.question);
  });
  return { pass: !failures.length, failures, unanswered };
};

export interface ScoreResult {
  panelists: { staffId: string; pct: number | null }[];
  average: number | null;
  complete: boolean;
  recommendation: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
}

/** Weighted score out of 100 for one panelist (scores are 1–5 per criterion). */
export const weighted = (scores: Record<string, number> | undefined, criteria: Criterion[]) => {
  if (!scores) return null;
  const total = criteria.reduce((n, c) => n + c.weight, 0) || 1;
  if (criteria.some((c) => !scores[c.id])) return null;
  return Math.round((criteria.reduce((n, c) => n + c.weight * (scores[c.id] / 5), 0) / total) * 1000) / 10;
};

export const recommendationFor = (avg: number | null): Pick<ScoreResult, 'recommendation' | 'tone'> =>
  avg === null
    ? { recommendation: 'Awaiting scores', tone: 'info' }
    : avg >= 75
    ? { recommendation: 'Strongly recommend', tone: 'success' }
    : avg >= OFFER_MIN_SCORE
    ? { recommendation: 'Recommend', tone: 'success' }
    : avg >= 50
    ? { recommendation: 'Hold', tone: 'warning' }
    : { recommendation: 'Do not hire', tone: 'danger' };

export const interviewResult = (iv: Interview, criteria: Criterion[]): ScoreResult => {
  const panelists = iv.panel.map((staffId) => ({ staffId, pct: weighted(iv.scores[staffId], criteria) }));
  const scored = panelists.filter((p) => p.pct !== null) as { staffId: string; pct: number }[];
  const average = scored.length ? Math.round((scored.reduce((n, p) => n + p.pct, 0) / scored.length) * 10) / 10 : null;
  const complete = iv.panel.length > 0 && scored.length === iv.panel.length;
  return { panelists, average, complete, ...recommendationFor(complete ? average : null) };
};

/** Latest completed interview score, else the score recorded on the applicant. */
export const candidateScore = (a: JobApplicant, v?: Vacancy) => {
  const done = (a.interviews ?? []).filter((i) => i.status === 'COMPLETED');
  const last = done[done.length - 1];
  if (last && v) return interviewResult(last, v.criteria).average;
  return a.scorecardScore || null;
};

export const checksFor = (a: JobApplicant): BackgroundCheck[] =>
  REQUIRED_CHECKS.concat(['MEDICAL']).map((kind) => a.checks?.find((c) => c.kind === kind) ?? { kind, status: 'NOT_STARTED' });

export const checksClear = (a: JobApplicant) => checksFor(a).filter((c) => REQUIRED_CHECKS.includes(c.kind)).every((c) => c.status === 'CLEAR' || c.status === 'WAIVED');

/** What stops an offer being prepared. */
export const offerBlockers = (a: JobApplicant, v?: Vacancy) => {
  const out: string[] = [];
  const done = (a.interviews ?? []).filter((i) => i.status === 'COMPLETED');
  if (!done.length) out.push('No completed interview with full panel scores.');
  const score = candidateScore(a, v);
  if (done.length && (score ?? 0) < OFFER_MIN_SCORE) out.push(`Interview score ${score}% is below the ${OFFER_MIN_SCORE}% needed for an offer.`);
  if (!checksClear(a)) out.push('Reference and background checks are not all clear.');
  return out;
};

export interface OfferCheck {
  errors: string[];
  aboveBand: boolean;
  band?: ReturnType<typeof bandOf>;
}

export const validateOffer = (o: { basic: number; grade: string; startDate: string; probationMonths: number; contractEndDate?: string }, opts: { casual: boolean; maxProbation: number; today?: string }): OfferCheck => {
  const errors: string[] = [];
  const band = bandOf(o.grade);
  const today = opts.today ?? todayIso();
  if (!opts.casual) {
    if (!o.basic || o.basic <= 0) errors.push('Enter the basic salary.');
    else if (band && o.basic < band.min) errors.push(`KES ${o.basic.toLocaleString()} is below the ${shortGrade(o.grade)} minimum of KES ${band.min.toLocaleString()}.`);
  }
  if (!o.startDate || o.startDate <= today) errors.push('The start date must be after today.');
  if (o.probationMonths < 0 || o.probationMonths > opts.maxProbation) errors.push(`Probation must be 0–${opts.maxProbation} months.`);
  if (o.contractEndDate && o.contractEndDate <= o.startDate) errors.push('The contract end date must be after the start date.');
  return { errors, aboveBand: !opts.casual && !!band && o.basic > band.max, band };
};

/* ------------------------------------------------------------------ onboarding */

export { onboardingTemplate, sessionTemplate };

export const isOperational = (department: string) => ['Operations', 'Production & Quality Control', 'Engineering & Maintenance', 'General Services', 'OSH & Compliance'].includes(department);

export const taskDue = (rec: OnboardingRecord, task: OnboardingTask) => (rec.startDate ? addDays(rec.startDate, task.dueOffset) : undefined);

export const onboardingProgress = (rec: OnboardingRecord) => {
  if (!rec.tasks?.length) return { done: Math.round(rec.progressPercent / 20), total: 5, pct: rec.progressPercent, blocking: [] as OnboardingTask[], overdue: [] as OnboardingTask[] };
  const done = rec.tasks.filter((x) => x.done).length;
  const today = todayIso();
  return {
    done,
    total: rec.tasks.length,
    pct: Math.round((done / rec.tasks.length) * 100),
    blocking: rec.tasks.filter((x) => x.requiredForStart && !x.done),
    overdue: rec.tasks.filter((x) => !x.done && (taskDue(rec, x) ?? '9999') < today)
  };
};

/** Missing personal or payment details that stop the employee record being created. */
export const termsGaps = (h?: HireTerms) => {
  if (!h) return ['Offer terms'];
  const out: string[] = [];
  if (!h.nationalId.trim()) out.push('National ID');
  if (!KRA_PIN_RE.test(h.kraPin.trim())) out.push('KRA PIN (format A123456789B)');
  if (!h.nssfNo.trim()) out.push('NSSF number');
  if (!h.shifNo.trim()) out.push('SHIF number');
  if (!h.gender) out.push('Gender');
  if (h.paymentMethod === 'BANK' && (!h.bankName || !h.bankAccount?.trim())) out.push('Bank and account number');
  if (h.paymentMethod === 'MPESA' && !h.mpesaPhone?.trim()) out.push('M-Pesa number');
  if (!h.supervisorStaffId) out.push('Supervisor');
  return out;
};

/** The employee master record created from a completed pre-boarding. */
export const employeeFromHire = (rec: OnboardingRecord, h: HireTerms, ctx: { staffId: string; branch: string; costCenter?: string; by: string; reqNo?: string }): Omit<HREmployee, 'id' | 'orgId'> => {
  const casual = !h.basic && !!h.dailyRate;
  const start = rec.startDate!;
  const [first, ...rest] = h.fullName.trim().split(/\s+/);
  return {
    staffId: ctx.staffId,
    fullName: h.fullName.trim(),
    firstName: first,
    lastName: rest[rest.length - 1],
    middleName: rest.length > 1 ? rest.slice(0, -1).join(' ') : undefined,
    email: workEmail(h.fullName, casual),
    personalEmail: h.personalEmail,
    phone: h.phone,
    nationalIdMasked: maskId(h.nationalId),
    kraPinMasked: maskKra(h.kraPin),
    nssfNoMasked: maskNssf(h.nssfNo),
    shifNoMasked: maskShif(h.shifNo),
    bankAccountMasked: h.paymentMethod === 'BANK' && h.bankName && h.bankAccount ? maskAccount(h.bankName, h.bankAccount) : '—',
    mpesaPhoneMasked: h.mpesaPhone ? maskPhone(h.mpesaPhone) : maskPhone(h.phone),
    paymentMethod: h.paymentMethod,
    bankName: h.paymentMethod === 'BANK' ? h.bankName : undefined,
    contractType: h.contractType,
    contractStartDate: start,
    contractEndDate: h.contractEndDate,
    department: h.department,
    branch: ctx.branch,
    stationId: h.stationId,
    costCenter: ctx.costCenter,
    jobTitle: h.jobTitle,
    grade: h.grade,
    basicSalaryKes: casual ? 0 : h.basic,
    payRateKes: casual ? h.dailyRate : undefined,
    joinedDate: start,
    status: 'ACTIVE',
    gender: h.gender,
    reportsToStaffId: h.supervisorStaffId,
    probationMonths: h.probationMonths,
    probationEndDate: h.probationMonths ? addDays(addMonths(start, h.probationMonths), -1) : undefined,
    probationStatus: h.probationMonths ? 'ON_PROBATION' : 'CONFIRMED',
    statutory: { paye: true, nssf: true, shif: true, ahl: true },
    tax: { employment: h.taxEmployment, pwdExempt: false, taxExempt: false },
    retirementAge: 60,
    documents: [
      { name: 'Signed employment contract', kind: 'Contract', addedOn: todayIso(), ref: rec.id },
      { name: 'National ID copy', kind: 'KYC', addedOn: todayIso() },
      { name: 'KRA PIN certificate', kind: 'KYC', addedOn: todayIso() },
      { name: 'NSSF and SHIF confirmation', kind: 'KYC', addedOn: todayIso() },
      { name: 'Offer letter', kind: 'Offer', addedOn: todayIso(), ref: ctx.reqNo }
    ],
    history: [{ date: start, kind: 'Joined', summary: `Joined as ${h.jobTitle}, ${shortGrade(h.grade)}${casual ? ` at KES ${h.dailyRate}/day` : ` on KES ${h.basic.toLocaleString()}`}`, ref: rec.id, by: ctx.by }]
  };
};

/* ------------------------------------------------------------------ employee master */

export interface ProbationInfo {
  applies: boolean;
  end?: string;
  status: 'ON_PROBATION' | 'EXTENDED' | 'CONFIRMED' | 'N/A';
  daysLeft?: number;
  maxEnd?: string;
}

export const probationOf = (e: HREmployee, defaultMonths: number, maxMonths = 12, today = todayIso()): ProbationInfo => {
  if (e.contractType === 'Daily-Rated Contract' || e.contractType === 'Output-Based Contract') return { applies: false, status: 'N/A' };
  const months = e.probationMonths ?? defaultMonths;
  const end = e.probationEndDate ?? addDays(addMonths(e.joinedDate, months), -1);
  const maxEnd = addDays(addMonths(e.joinedDate, maxMonths), -1);
  const status = e.probationStatus ?? (end < today ? 'CONFIRMED' : 'ON_PROBATION');
  return { applies: true, end, status, daysLeft: status === 'CONFIRMED' ? undefined : daysBetween(today, end), maxEnd };
};

/** Basic salary month by month from joining to the open period, with the recorded reason for each change. */
export const salaryTimeline = (e: HREmployee, openKey: string) => {
  if (isCasual(e)) return [];
  const out: { from: string; basic: number; previous?: number; reason: string; ref?: string; by?: string; future?: boolean }[] = [];
  const [jy, jm] = e.joinedDate.split('-').map(Number);
  const hist = (e.salaryHistory ?? []).slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const lastKey = hist.length && hist[hist.length - 1].effectiveFrom > openKey ? hist[hist.length - 1].effectiveFrom : openKey;
  let y = jy;
  let m = jm - 1;
  let prev: number | undefined;
  while (periodKey(y, m) <= lastKey) {
    const key = periodKey(y, m);
    const b = basicFor(e, y, m);
    if (b !== prev) {
      const h = hist.find((x) => x.effectiveFrom === key);
      out.push({
        from: key,
        basic: b,
        previous: prev,
        reason: h?.reason ?? (prev === undefined ? 'Starting salary' : y === 2026 && m === 0 ? '2026 pay review' : 'Salary change'),
        ref: h?.ref,
        by: h?.by,
        future: key > openKey
      });
      prev = b;
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out.reverse();
};

export interface OrgNode {
  e: HREmployee;
  children: OrgNode[];
}

/** Reporting tree from supervisor links; a loop at the top is broken at the most senior person. */
export const orgTree = (staff: HREmployee[], all: HREmployee[]): OrgNode[] => {
  const ids = new Set(staff.map((e) => e.staffId));
  const parent = new Map<string, string | undefined>();
  staff.forEach((e) => {
    const s = supervisorFor(e, all);
    parent.set(e.staffId, s && ids.has(s.staffId) && s.staffId !== e.staffId ? s.staffId : undefined);
  });
  const senior = (id: string) => {
    const e = staff.find((x) => x.staffId === id)!;
    return (/chief|managing director/i.test(e.jobTitle) ? 1e9 : 0) + e.basicSalaryKes;
  };
  for (const e of staff) {
    const seen: string[] = [];
    let cur: string | undefined = e.staffId;
    while (cur && !seen.includes(cur)) {
      seen.push(cur);
      cur = parent.get(cur);
    }
    if (cur) {
      const loop = seen.slice(seen.indexOf(cur));
      const top = loop.sort((a, b) => senior(b) - senior(a))[0];
      parent.set(top, undefined);
    }
  }
  const build = (id: string): OrgNode => ({
    e: staff.find((x) => x.staffId === id)!,
    children: staff
      .filter((x) => parent.get(x.staffId) === id)
      .sort((a, b) => b.basicSalaryKes - a.basicSalaryKes || a.fullName.localeCompare(b.fullName))
      .map((x) => build(x.staffId))
  });
  return staff
    .filter((e) => !parent.get(e.staffId))
    .sort((a, b) => senior(b.staffId) - senior(a.staffId))
    .map((e) => build(e.staffId));
};

export const countNodes = (n: OrgNode): number => 1 + n.children.reduce((s, c) => s + countNodes(c), 0);

/* ------------------------------------------------------------------ recruitment statistics */

export const hiringStats = (candidates: JobApplicant[], vacancies: Vacancy[], requisitions: EmployeeRequisition[]) => {
  const hired = candidates.filter((c) => stageOf(c) === 'Hired');
  const acceptedOn = (c: JobApplicant) => c.offer?.respondedOn ?? c.stageLog?.find((s) => s.stage === 'Hired')?.at;
  const tth = hired.map((c) => (acceptedOn(c) ? daysBetween(c.appliedDate, acceptedOn(c)!) : null)).filter((x): x is number => x !== null);
  const ttf = hired
    .map((c) => {
      const v = vacancies.find((x) => x.id === c.vacancyId);
      const r = requisitions.find((x) => x.id === v?.requisitionId);
      const approved = r?.decidedDate ?? v?.openedOn;
      return approved && acceptedOn(c) ? daysBetween(approved, acceptedOn(c)!) : null;
    })
    .filter((x): x is number => x !== null);
  const offers = candidates.filter((c) => c.offer && ['ACCEPTED', 'DECLINED'].includes(c.offer.status));
  const bySource = new Map<string, { applied: number; hired: number }>();
  candidates.forEach((c) => {
    const k = c.source ?? 'Not recorded';
    const s = bySource.get(k) ?? { applied: 0, hired: 0 };
    s.applied++;
    if (stageOf(c) === 'Hired') s.hired++;
    bySource.set(k, s);
  });
  const reached = (stage: PipelineStage) => {
    const idx = ['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'].indexOf(stage);
    return candidates.filter((c) => {
      const s = stageOf(c);
      const log = (c.stageLog ?? []).map((x) => x.stage);
      const furthest = Math.max(['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'].indexOf(s), ...log.map((x) => ['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'].indexOf(x)));
      return furthest >= idx;
    }).length;
  };
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    timeToHire: avg(tth),
    timeToFill: avg(ttf),
    hires: hired.length,
    offerAcceptance: offers.length ? Math.round((offers.filter((c) => c.offer!.status === 'ACCEPTED').length / offers.length) * 100) : null,
    sources: [...bySource.entries()].map(([source, s]) => ({ source, ...s })).sort((a, b) => b.applied - a.applied),
    funnel: (['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'] as PipelineStage[]).map((stage) => ({ stage, count: reached(stage) }))
  };
};
