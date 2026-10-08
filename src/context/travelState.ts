import { useMemo, useState } from 'react';
import type { PeopleDeps } from './sliceDeps';
import { todayIso } from '../data/hireEngine';
import { supervisorFor } from '../data/leaveConfig';
import { buildTravelSeed, DEFAULT_FLOAT_LIMIT, FLOAT_LIMITS, PER_DIEM_SEED } from '../data/travelSeed';
import {
  bandOf,
  dueDateFor,
  estimateTrip,
  FINANCE_APPROVER,
  floatEffect,
  imprestBlockReason,
  PETTY_CASH_LIMIT,
  lineAmount,
  linesOf,
  receiptsTotal,
  scheduleOn,
  type FloatMove,
  type Imprest,
  type ImprestKind,
  type ImprestLine,
  type PerDiemSchedule,
  type ReceiptLine,
  type Settlement,
  type TravelEvent,
  type TravelRequest
} from '../data/travelEngine';

export type TravelDraft = Pick<TravelRequest, 'staffId' | 'purpose' | 'destinations' | 'destClass' | 'departDate' | 'returnDate' | 'transport' | 'km' | 'fares' | 'advanceRequested'>;
export type ImprestLineDraft = Pick<ImprestLine, 'description' | 'category' | 'costCentre' | 'quantity' | 'unitCost'>;
/** A petty cash or imprest request with one or more lines; the amount is their total. */
export type ImprestDraft = { staffId: string; kind: Exclude<ImprestKind, 'TRAVEL'>; purpose: string; costCentre: string; lines: ImprestLineDraft[]; dueOn?: string };
export type SurrenderInput = { lines: ReceiptLine[]; settlement: Settlement; overspendApproved?: boolean };
type Result = { ok: boolean; reason?: string; id?: string };

export interface PettyCashFloat {
  orgId: string;
  limit: number;
  balance: number;
  /** Limit less balance: what a replenishment puts back */
  toReplenish: number;
  movements: FloatMove[];
}

/** Travel, petty cash and imprest state exposed through the app context. */
export interface TravelStateSlice {
  travelToday: string;
  /** Every version of the per diem policy (group-wide) */
  perDiemSchedules: PerDiemSchedule[];
  /** The version in force today */
  perDiemRates: PerDiemSchedule;
  savePerDiemRates: (s: Omit<PerDiemSchedule, 'id' | 'savedBy' | 'savedOn'>, by?: string) => void;
  /** Travel requests of the selected company */
  travelRequests: TravelRequest[];
  /** Every company's trips — the employee portal shows an employee their own wherever HR is looking */
  allTravelRequests: TravelRequest[];
  saveTravelRequest: (d: TravelDraft, submit: boolean, id?: string, by?: string) => Result;
  submitTravelRequest: (id: string, by?: string) => Result;
  decideTravelRequest: (id: string, approve: boolean, comment: string, opts?: { by?: string; perDiemVia?: 'CASH' | 'PAYROLL'; advanceApproved?: number }) => Result;
  markTravelled: (id: string, by?: string) => void;
  closeTravelRequest: (id: string, by?: string) => void;
  /** Petty cash, imprest and travel advances of the selected company */
  imprests: Imprest[];
  allImprests: Imprest[];
  requestImprest: (d: ImprestDraft, by?: string) => Result;
  /** Approve or decline; `approvedAmounts` (one per line) lets the approver allow less on some lines */
  decideImprest: (id: string, approve: boolean, comment: string, by?: string, approvedAmounts?: number[]) => void;
  payImprest: (id: string, by?: string) => Result;
  surrenderImprest: (id: string, s: SurrenderInput, by?: string) => Result;
  recoverImprestViaPayroll: (id: string, by?: string) => Result;
  /** Why an employee can't take a new advance (unsurrendered imprest past due) */
  imprestBlock: (staffId: string) => string | undefined;
  pettyCashFloat: PettyCashFloat;
  replenishPettyCash: (by?: string) => void;
}

const ME = 'Rose Chepkoech';
const nextId = (prefix: string, ids: string[]) => {
  const n = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0));
  return `${prefix}${String(n + 1).padStart(3, '0')}`;
};
const ev = (by: string, action: string, comment?: string): TravelEvent => ({ at: todayIso(), by, action, ...(comment ? { comment } : {}) });

export const useTravelState = (d: PeopleDeps): TravelStateSlice => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, postPayItems, logEmployeeEdit, addToast } = d;
  const [seed] = useState(() => buildTravelSeed(hrEmployees));
  const [schedules, setSchedules] = useState<PerDiemSchedule[]>(PER_DIEM_SEED);
  const [requests, setRequests] = useState<TravelRequest[]>(seed.requests);
  const [allImprests, setImprests] = useState<Imprest[]>(seed.imprests);
  const [moves, setMoves] = useState<FloatMove[]>(seed.floatMoves);
  const today = todayIso();

  const byId = useMemo(() => new Map(hrEmployees.map((e) => [e.staffId, e])), [hrEmployees]);
  const nameOf = (id?: string) => (id ? (byId.get(id)?.fullName ?? id) : '—');
  const year = today.slice(0, 4);

  const patchReq = (id: string, f: (r: TravelRequest) => TravelRequest) => setRequests((rs) => rs.map((r) => (r.id === id ? f(r) : r)));
  const patchImp = (id: string, f: (i: Imprest) => Imprest) => setImprests((is) => is.map((i) => (i.id === id ? f(i) : i)));
  const block = (staffId: string) => imprestBlockReason(staffId, allImprests, today);

  const pettyCashFloat = useMemo<PettyCashFloat>(() => {
    const movements = moves.filter((m) => m.orgId === selectedOrgId).sort((a, b) => a.on.localeCompare(b.on));
    const balance = movements.reduce((n, m) => n + floatEffect(m), 0);
    const limit = FLOAT_LIMITS[selectedOrgId] ?? DEFAULT_FLOAT_LIMIT;
    return { orgId: selectedOrgId, limit, balance, toReplenish: Math.max(0, limit - balance), movements };
  }, [moves, selectedOrgId]);

  // A company with no float yet starts with an opening balance on first use
  const floatOf = (orgId: string) => moves.filter((m) => m.orgId === orgId).reduce((n, m) => n + floatEffect(m), 0);
  const addMove = (m: Omit<FloatMove, 'id'>) =>
    setMoves((ms) => {
      const opening: FloatMove[] = ms.some((x) => x.orgId === m.orgId)
        ? []
        : [{ id: `FM-${m.orgId}-0`, orgId: m.orgId, on: today, kind: 'OPENING', amount: FLOAT_LIMITS[m.orgId] ?? DEFAULT_FLOAT_LIMIT, ref: 'Opening float', by: 'Finance' }];
      return [...ms, ...opening, { ...m, id: `FM-${m.ref}-${ms.length}` }];
    });

  /* ------------------------------------------------------------------ rates */

  const savePerDiemRates: TravelStateSlice['savePerDiemRates'] = (s, by = ME) => {
    const id = `PDR-${s.effectiveFrom.slice(0, 7)}`;
    setSchedules((all) => [...all.filter((x) => x.id !== id), { ...s, id, savedBy: by, savedOn: today }]);
    addToast({ type: 'success', title: 'Per diem rates saved', message: `New rates apply to trips departing from ${s.effectiveFrom}. Earlier versions are kept.` });
  };

  /* ------------------------------------------------------------------ travel requests */

  const saveTravelRequest: TravelStateSlice['saveTravelRequest'] = (dr, submit, id, by) => {
    const e = byId.get(dr.staffId);
    if (!e) return { ok: false, reason: 'Choose the employee travelling.' };
    if (!dr.purpose.trim() || !dr.destinations.trim()) return { ok: false, reason: 'Give the purpose and destination.' };
    if (!dr.departDate || !dr.returnDate || dr.returnDate < dr.departDate) return { ok: false, reason: 'The return date must be on or after the departure date.' };
    const estimate = estimateTrip(dr, bandOf(e), schedules);
    if (dr.advanceRequested > estimate.total) return { ok: false, reason: `The advance can't be more than the estimated cost (KES ${estimate.total.toLocaleString()}).` };
    if (submit && dr.advanceRequested > 0) {
      const why = block(dr.staffId);
      if (why) return { ok: false, reason: why };
    }
    const actor = by ?? e.fullName;
    const mgr = supervisorFor(e, hrEmployees);
    const newId =
      id ??
      nextId(
        `TRV-${year}-`,
        requests.map((r) => r.id)
      );
    const events = [ev(actor, id ? 'Request updated' : 'Request created'), ...(submit ? [ev(actor, `Submitted to line manager${mgr ? ` (${mgr.fullName})` : ''}`)] : [])];
    const base: TravelRequest = { ...dr, id: newId, orgId: e.orgId, estimate, managerId: mgr?.staffId, status: submit ? 'SUBMITTED' : 'DRAFT', createdOn: today, events };
    setRequests((rs) => (id ? rs.map((r) => (r.id === id ? { ...base, createdOn: r.createdOn, events: [...r.events, ...events] } : r)) : [base, ...rs]));
    addToast({ type: 'success', title: submit ? 'Travel request submitted' : 'Draft saved', message: `${newId} for ${e.fullName}${submit && mgr ? ` — waiting for ${mgr.fullName}` : ''}.` });
    return { ok: true, id: newId };
  };

  const submitTravelRequest: TravelStateSlice['submitTravelRequest'] = (id, by) => {
    const r = requests.find((x) => x.id === id);
    if (!r || r.status !== 'DRAFT') return { ok: false, reason: 'Only drafts can be submitted.' };
    const why = r.advanceRequested > 0 ? block(r.staffId) : undefined;
    if (why) return { ok: false, reason: why };
    patchReq(id, (x) => ({ ...x, status: 'SUBMITTED', events: [...x.events, ev(by ?? nameOf(x.staffId), `Submitted to line manager (${nameOf(x.managerId)})`)] }));
    addToast({ type: 'success', title: 'Submitted', message: `${id} sent to ${nameOf(r.managerId)} for approval.` });
    return { ok: true };
  };

  const decideTravelRequest: TravelStateSlice['decideTravelRequest'] = (id, approve, comment, opts = {}) => {
    const r = requests.find((x) => x.id === id);
    if (!r) return { ok: false, reason: 'Request not found.' };
    const stage = r.status === 'SUBMITTED' ? 'MANAGER' : r.status === 'MANAGER_APPROVED' ? 'FINANCE' : undefined;
    if (!stage) return { ok: false, reason: 'This request is not waiting for approval.' };
    const by = opts.by ?? (stage === 'MANAGER' ? nameOf(r.managerId) : nameOf(FINANCE_APPROVER));
    const who = stage === 'MANAGER' ? 'line manager' : 'Finance';
    if (!approve) {
      if (!comment.trim()) return { ok: false, reason: 'Say why the request is declined.' };
      patchReq(id, (x) => ({ ...x, status: 'DECLINED', events: [...x.events, ev(by, `Declined by ${who}`, comment)] }));
      addToast({ type: 'info', title: 'Travel request declined', message: `${id} — ${nameOf(r.staffId)} has been told.` });
      return { ok: true };
    }
    if (stage === 'MANAGER') {
      patchReq(id, (x) => ({ ...x, status: 'MANAGER_APPROVED', events: [...x.events, ev(by, 'Approved by line manager', comment || undefined)] }));
      addToast({ type: 'success', title: 'Approved by line manager', message: `${id} now waits for Finance (${nameOf(FINANCE_APPROVER)}).` });
      return { ok: true };
    }
    // Finance: per diem in cash (inside the advance) or through payroll as an exempt PER_DIEM item
    const via = opts.perDiemVia ?? 'CASH';
    const cap = via === 'PAYROLL' ? r.estimate.total - r.estimate.perDiem : r.estimate.total;
    const advance = Math.max(0, Math.min(opts.advanceApproved ?? r.advanceRequested, cap));
    if (advance > 0) {
      const why = block(r.staffId);
      if (why) return { ok: false, reason: why };
    }
    const events: TravelEvent[] = [ev(by, `Approved by Finance — advance KES ${advance.toLocaleString()}, per diem ${via === 'PAYROLL' ? 'through payroll' : 'in cash'}`, comment || undefined)];
    let perDiemPayRef: string | undefined;
    if (via === 'PAYROLL' && r.estimate.perDiem > 0) {
      postPayItems(
        [
          {
            staffId: r.staffId,
            componentId: 'PER_DIEM',
            amount: r.estimate.perDiem,
            quantity: Math.max(1, r.estimate.nights),
            period: payrollOpenPeriod.key,
            recurring: false,
            reference: r.id,
            note: `Per diem ${r.destinations}, ${r.estimate.nights} night(s)`,
            source: 'Manual'
          }
        ],
        by
      );
      logEmployeeEdit(r.staffId, [{ action: `Per diem KES ${r.estimate.perDiem.toLocaleString()} for ${r.id} posted to ${payrollOpenPeriod.label} payroll` }], by);
      perDiemPayRef = `${r.id} · ${payrollOpenPeriod.label}`;
      events.push(ev(by, `Per diem KES ${r.estimate.perDiem.toLocaleString()} posted to ${payrollOpenPeriod.label} payroll (exempt)`));
    }
    let imprestId: string | undefined;
    if (advance > 0) {
      imprestId = nextId(
        `IMP-${year}-`,
        allImprests.map((i) => i.id)
      );
      const e = byId.get(r.staffId);
      const imp: Imprest = {
        id: imprestId,
        orgId: r.orgId,
        staffId: r.staffId,
        kind: 'TRAVEL',
        travelId: r.id,
        purpose: `Travel advance — ${r.purpose}`,
        costCentre: e?.department ?? '',
        amount: advance,
        requestedOn: r.createdOn,
        approverId: FINANCE_APPROVER,
        status: 'APPROVED',
        dueOn: dueDateFor('TRAVEL', today, r.returnDate),
        events: [ev(by, 'Advance approved with the travel request')]
      };
      setImprests((is) => [imp, ...is]);
    }
    patchReq(id, (x) => ({ ...x, status: 'FINANCE_APPROVED', perDiemVia: via, perDiemPayRef, advanceApproved: advance, imprestId, events: [...x.events, ...events] }));
    addToast({
      type: 'success',
      title: 'Approved by Finance',
      message: advance > 0 ? `${id}: advance ${imprestId} of KES ${advance.toLocaleString()} is ready to pay.` : `${id}: no cash advance — ready to travel.`
    });
    return { ok: true };
  };

  const markTravelled: TravelStateSlice['markTravelled'] = (id, by) =>
    patchReq(id, (x) => ({ ...x, status: 'TRAVELLED', events: [...x.events, ev(by ?? x.events[0]?.by ?? ME, 'Back from the trip')] }));

  const closeTravelRequest: TravelStateSlice['closeTravelRequest'] = (id, by = nameOf(FINANCE_APPROVER)) => {
    patchReq(id, (x) => ({ ...x, status: 'CLOSED', events: [...x.events, ev(by, 'Trip closed')] }));
    addToast({ type: 'success', title: 'Trip closed', message: `${id} is closed.` });
  };

  /* ------------------------------------------------------------------ petty cash and imprest */

  const requestImprest: TravelStateSlice['requestImprest'] = (dr, by) => {
    const e = byId.get(dr.staffId);
    if (!e) return { ok: false, reason: 'Choose the employee.' };
    if (!dr.purpose.trim()) return { ok: false, reason: 'Say what the money is for.' };
    // Blank rows are ignored; every remaining line needs a description and an amount
    const lines: ImprestLine[] = dr.lines
      .filter((l) => l.description.trim() || Number(l.unitCost) > 0)
      .map((l) => ({ ...l, description: l.description.trim(), costCentre: l.costCentre || dr.costCentre || e.department, quantity: Number(l.quantity) || 1, unitCost: Number(l.unitCost) || 0, amount: lineAmount({ quantity: Number(l.quantity) || 1, unitCost: l.unitCost }) }));
    if (!lines.length) return { ok: false, reason: 'Add at least one line.' };
    const bad = lines.findIndex((l) => !l.description || !(l.amount > 0));
    if (bad >= 0) return { ok: false, reason: `Line ${bad + 1}: give a description and an amount.` };
    const total = lines.reduce((n, l) => n + l.amount, 0);
    if (dr.kind === 'PETTY_CASH' && total > PETTY_CASH_LIMIT)
      return { ok: false, reason: `Petty cash is limited to KES ${PETTY_CASH_LIMIT.toLocaleString()} a request. Raise an imprest instead.` };
    const why = block(dr.staffId);
    if (why) return { ok: false, reason: why };
    const prefix = dr.kind === 'PETTY_CASH' ? `PC-${year}-` : `IMP-${year}-`;
    const id = nextId(
      prefix,
      allImprests.map((i) => i.id)
    );
    const approver = supervisorFor(e, hrEmployees);
    const imp: Imprest = {
      id,
      orgId: e.orgId,
      staffId: dr.staffId,
      kind: dr.kind,
      purpose: dr.purpose,
      costCentre: new Set(lines.map((l) => l.costCentre)).size > 1 ? 'Several' : lines[0].costCentre,
      amount: total,
      requestedAmount: total,
      lines,
      requestedOn: today,
      approverId: approver?.staffId,
      status: 'PENDING',
      dueOn: dr.dueOn,
      events: [ev(by ?? e.fullName, 'Requested')]
    };
    setImprests((is) => [imp, ...is]);
    addToast({ type: 'success', title: dr.kind === 'PETTY_CASH' ? 'Petty cash requested' : 'Imprest requested', message: `${id}: ${lines.length} line${lines.length > 1 ? 's' : ''}, KES ${total.toLocaleString()} — waiting for ${approver?.fullName ?? 'approval'}.` });
    return { ok: true, id };
  };

  const decideImprest: TravelStateSlice['decideImprest'] = (id, approve, comment, by, approvedAmounts) => {
    const i = allImprests.find((x) => x.id === id);
    if (!i) return;
    const actor = by ?? nameOf(i.approverId);
    // Each line can be allowed in full or in part, never above what was asked
    const lines = linesOf(i).map((l, k) => ({ ...l, approved: approve ? Math.max(0, Math.min(l.amount, Math.round(approvedAmounts?.[k] ?? l.amount))) : 0 }));
    const allowed = lines.reduce((n, l) => n + (l.approved ?? 0), 0);
    if (approve && allowed <= 0) {
      addToast({ type: 'error', title: 'Nothing approved', message: 'Allow at least one line, or decline the request.' });
      return;
    }
    const trimmed = approve && allowed < (i.requestedAmount ?? i.amount);
    const note = trimmed ? `Approved KES ${allowed.toLocaleString()} of ${(i.requestedAmount ?? i.amount).toLocaleString()}${comment ? ` — ${comment}` : ''}` : comment || undefined;
    patchImp(id, (x) => ({
      ...x,
      lines: x.lines?.length ? lines : x.lines,
      requestedAmount: x.requestedAmount ?? x.amount,
      amount: approve ? allowed : x.amount,
      status: approve ? 'APPROVED' : 'DECLINED',
      events: [...x.events, ev(actor, approve ? (trimmed ? 'Approved in part' : 'Approved') : 'Declined', note)]
    }));
    addToast({ type: approve ? 'success' : 'info', title: approve ? (trimmed ? 'Approved in part' : 'Approved') : 'Declined', message: `${id} ${approve ? `is ready to pay: KES ${allowed.toLocaleString()}` : 'was declined'}.` });
  };

  const payImprest: TravelStateSlice['payImprest'] = (id, by = 'Grace Wanjiku') => {
    const i = allImprests.find((x) => x.id === id);
    if (!i || i.status !== 'APPROVED') return { ok: false, reason: 'Only approved requests can be paid.' };
    const why = block(i.staffId);
    if (why) return { ok: false, reason: why };
    const fromFloat = i.kind === 'PETTY_CASH';
    if (fromFloat && floatOf(i.orgId) < i.amount) return { ok: false, reason: `The petty cash float has KES ${floatOf(i.orgId).toLocaleString()} — replenish it first.` };
    const trip = i.travelId ? requests.find((r) => r.id === i.travelId) : undefined;
    const dueOn = i.dueOn && i.kind === 'STANDALONE' ? i.dueOn : dueDateFor(i.kind, today, trip?.returnDate);
    patchImp(id, (x) => ({
      ...x,
      status: 'PAID',
      paidOn: today,
      paidFrom: fromFloat ? 'FLOAT' : 'BANK',
      dueOn,
      events: [...x.events, ev(by, fromFloat ? 'Paid from the petty cash float' : 'Paid by bank transfer')]
    }));
    if (fromFloat) addMove({ orgId: i.orgId, on: today, kind: 'ISSUE', amount: i.amount, ref: i.id, by, note: i.purpose });
    if (trip && trip.status === 'FINANCE_APPROVED') patchReq(trip.id, (x) => ({ ...x, status: 'ADVANCE_PAID', events: [...x.events, ev(by, `Advance ${id} paid`)] }));
    addToast({ type: 'success', title: 'Paid', message: `${id}: KES ${i.amount.toLocaleString()} to ${nameOf(i.staffId)}. Receipts due by ${dueOn}.` });
    return { ok: true };
  };

  const surrenderImprest: TravelStateSlice['surrenderImprest'] = (id, s, by) => {
    const i = allImprests.find((x) => x.id === id);
    if (!i || i.status !== 'PAID') return { ok: false, reason: 'Only paid advances can be surrendered.' };
    const lines = s.lines.filter((l) => l.description.trim() && Number(l.amount) > 0);
    if (!lines.length) return { ok: false, reason: 'Add at least one receipt line.' };
    if (lines.some((l) => !l.receiptNo.trim())) return { ok: false, reason: 'Every line needs a receipt number.' };
    const spent = receiptsTotal(lines);
    const variance = i.amount - spent;
    const settlement: Settlement = variance === 0 ? 'NONE' : s.settlement;
    if (variance > 0 && !['CASH_REFUND', 'PAYROLL_RECOVERY'].includes(settlement)) return { ok: false, reason: 'Choose how the unspent balance comes back.' };
    if (variance < 0 && !['PAYROLL_REIMBURSE', 'CASH_REIMBURSE', 'NOT_REIMBURSED'].includes(settlement)) return { ok: false, reason: 'Choose how the overspend is handled.' };
    if (variance < 0 && settlement !== 'NOT_REIMBURSED' && !s.overspendApproved) return { ok: false, reason: 'An overspend is only reimbursed once Finance approves it.' };
    const actor = by ?? nameOf(i.staffId);
    const ref = i.travelId ?? i.id;
    let payrollRef: string | undefined;
    if (settlement === 'PAYROLL_RECOVERY' || settlement === 'PAYROLL_REIMBURSE') {
      const recover = settlement === 'PAYROLL_RECOVERY';
      postPayItems(
        [
          {
            staffId: i.staffId,
            componentId: recover ? 'OTHER_DEDUCTION' : 'REIMBURSEMENT',
            amount: Math.abs(variance),
            period: payrollOpenPeriod.key,
            recurring: false,
            reference: ref,
            note: recover ? `Imprest recovery ${ref} (${i.id})` : `Imprest overspend ${ref} (${i.id})`,
            source: 'Manual'
          }
        ],
        actor
      );
      logEmployeeEdit(
        i.staffId,
        [{ action: `${recover ? 'Imprest recovery' : 'Imprest overspend reimbursement'} KES ${Math.abs(variance).toLocaleString()} (${i.id}) posted to ${payrollOpenPeriod.label} payroll` }],
        actor
      );
      payrollRef = ref;
    }
    if (i.paidFrom === 'FLOAT' && settlement === 'CASH_REFUND') addMove({ orgId: i.orgId, on: today, kind: 'REFUND', amount: variance, ref: i.id, by: actor, note: 'Change returned' });
    if (i.paidFrom === 'FLOAT' && settlement === 'CASH_REIMBURSE')
      addMove({ orgId: i.orgId, on: today, kind: 'ISSUE', amount: -variance, ref: i.id, by: actor, note: 'Overspend paid back to employee' });
    patchImp(id, (x) => ({
      ...x,
      status: 'SURRENDERED',
      surrender: { on: today, by: actor, lines, spent, variance, settlement, overspendApproved: s.overspendApproved, payrollRef, payrollPeriod: payrollRef ? payrollOpenPeriod.key : undefined },
      events: [...x.events, ev(actor, `Surrendered — spent KES ${spent.toLocaleString()}`)]
    }));
    if (i.travelId) patchReq(i.travelId, (x) => ({ ...x, status: 'SURRENDERED', events: [...x.events, ev(actor, `Advance ${i.id} surrendered`)] }));
    addToast({
      type: 'success',
      title: 'Surrender recorded',
      message: `${id}: spent KES ${spent.toLocaleString()} of ${i.amount.toLocaleString()}.${payrollRef ? ` Balance posted to ${payrollOpenPeriod.label} payroll.` : ''}`
    });
    return { ok: true };
  };

  const recoverImprestViaPayroll: TravelStateSlice['recoverImprestViaPayroll'] = (id, by = nameOf(FINANCE_APPROVER)) => {
    const i = allImprests.find((x) => x.id === id);
    if (!i || i.status !== 'PAID') return { ok: false, reason: 'Only unsurrendered advances can be recovered.' };
    const ref = i.travelId ?? i.id;
    postPayItems(
      [
        {
          staffId: i.staffId,
          componentId: 'OTHER_DEDUCTION',
          amount: i.amount,
          period: payrollOpenPeriod.key,
          recurring: false,
          reference: ref,
          note: `Imprest recovery ${ref} (${i.id}) — not surrendered`,
          source: 'Manual'
        }
      ],
      by
    );
    logEmployeeEdit(i.staffId, [{ action: `Unsurrendered imprest ${i.id} KES ${i.amount.toLocaleString()} recovered through ${payrollOpenPeriod.label} payroll` }], by);
    patchImp(id, (x) => ({
      ...x,
      status: 'RECOVERED',
      recovery: { on: today, by, amount: i.amount, period: payrollOpenPeriod.key, ref },
      events: [...x.events, ev(by, `Not surrendered — KES ${i.amount.toLocaleString()} recovered through ${payrollOpenPeriod.label} payroll`)]
    }));
    if (i.travelId) patchReq(i.travelId, (x) => ({ ...x, status: 'CLOSED', events: [...x.events, ev(by, `Advance ${i.id} recovered through payroll — trip closed`)] }));
    addToast({ type: 'warning', title: 'Recovery posted to payroll', message: `KES ${i.amount.toLocaleString()} will be deducted from ${nameOf(i.staffId)} in ${payrollOpenPeriod.label}.` });
    return { ok: true };
  };

  const replenishPettyCash: TravelStateSlice['replenishPettyCash'] = (by = nameOf(FINANCE_APPROVER)) => {
    const top = pettyCashFloat.limit - pettyCashFloat.balance;
    if (top <= 0) return;
    addMove({ orgId: selectedOrgId, on: today, kind: 'REPLENISH', amount: top, ref: `REP-${today}`, by, note: 'Cheque cashed to restore the float' });
    addToast({ type: 'success', title: 'Float replenished', message: `KES ${top.toLocaleString()} added — the float is back to KES ${pettyCashFloat.limit.toLocaleString()}.` });
  };

  const travelRequests = useMemo(() => requests.filter((r) => r.orgId === selectedOrgId), [requests, selectedOrgId]);
  const imprests = useMemo(() => allImprests.filter((i) => i.orgId === selectedOrgId), [allImprests, selectedOrgId]);

  return {
    travelToday: today,
    perDiemSchedules: schedules,
    perDiemRates: scheduleOn(schedules, today),
    savePerDiemRates,
    travelRequests,
    allTravelRequests: requests,
    saveTravelRequest,
    submitTravelRequest,
    decideTravelRequest,
    markTravelled,
    closeTravelRequest,
    imprests,
    allImprests,
    requestImprest,
    decideImprest,
    payImprest,
    surrenderImprest,
    recoverImprestViaPayroll,
    imprestBlock: block,
    pettyCashFloat,
    replenishPettyCash
  };
};
