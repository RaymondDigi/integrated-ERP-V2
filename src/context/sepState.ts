import { useState } from 'react';
import type { HREmployee } from '../types';
import type { PayItem } from '../data/payItems';
import type { ExitType } from '../data/payrollEngine';
import {
  clearanceDone,
  clearanceTemplate,
  EXIT_LABEL,
  engineExitType,
  finalDuesItems,
  isoDay,
  type ClearanceItem,
  type ExitCase,
  type ExitInterview,
  type ExitKind,
  type ExitStage
} from '../data/sepEngine';

type Toast = (t: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string }) => void;
type Draft = Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>;

export interface SepStateSlice {
  exitCases: ExitCase[];
  tenantExitCases: ExitCase[];
  startExit: (d: { staffId: string; kind: ExitKind; noticeDate: string; lastDay: string; reason: string; caseRef?: string; labourNoticeOn?: string; waiveShortfall?: boolean }, by: string) => ExitCase | null;
  updateExit: (id: string, patch: Partial<ExitCase>, text?: string, by?: string) => void;
  setClearance: (id: string, itemId: string, status: ClearanceItem['status'], by: string, note?: string) => void;
  clearDept: (id: string, dept: ClearanceItem['dept'], by: string) => void;
  saveExitInterview: (id: string, i: ExitInterview) => void;
  /** HR prepares, Finance approves: posts the dues items and sets the exit date payroll uses */
  prepareDues: (id: string, by: string) => void;
  approveDues: (id: string, by: string, bond?: { amount: number; ref: string }) => boolean;
  withdrawExit: (id: string, by: string, reason: string) => void;
  issueCertificate: (id: string, by: string) => void;
  /** Bond still owed on exit, if the Training module is present */
  bondFor: (staffId: string, exitDate: string) => { amount: number; ref: string } | undefined;
}

interface Deps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  payrollOpenPeriod: { key: string; label: string };
  postPayItems: (items: Draft[], by?: string) => number;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  setExitTypes: (f: (m: Record<string, ExitType>) => Record<string, ExitType>) => void;
  addToast: Toast;
  /** From the Training module when it is loaded */
  bondRecovery?: (staffId: string, exitDate: string) => { amount: number; ref: string } | undefined;
  onBondRecovered?: (staffId: string, exitDate: string) => void;
}

const today = () => isoDay(new Date());
const NOW = new Date();
const rel = (days: number) => isoDay(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days));

const seedCase = (c: Omit<ExitCase, 'clearance' | 'timeline'> & { cleared?: 'all' | ClearanceItem['dept'][] }, e: HREmployee | undefined): ExitCase => {
  const clearance = e ? clearanceTemplate(e, c.id) : [];
  const done = c.cleared === 'all' ? clearance : clearance.filter((x) => (c.cleared ?? []).includes(x.dept));
  return {
    ...c,
    clearance: clearance.map((x) => (done.includes(x) ? { ...x, status: 'CLEARED', by: 'Clearance owner', at: c.lastDay < today() ? c.lastDay : today() } : x)),
    timeline: [{ at: c.raisedOn, by: c.raisedBy, text: `${EXIT_LABEL[c.kind]} recorded — last working day ${c.lastDay}` }]
  };
};

const seed = (list: HREmployee[]): ExitCase[] => {
  const e = (id: string) => list.find((x) => x.staffId === id);
  const interview = (reasons: string[], rating: number, regrettable: boolean, comments: string, doneOn: string): ExitInterview => ({
    doneOn,
    by: 'Rose Chepkoech',
    reasons,
    rating,
    wouldRejoin: rating >= 3,
    recommend: rating >= 3,
    comments,
    regrettable
  });
  return [
    {
      ...seedCase(
        { id: 'SEP-2026-009', orgId: 'org-kericho', staffId: 'KHE-0211', kind: 'RETIREMENT', stage: 'CLOSED', noticeDate: '2026-06-30', lastDay: '2026-09-30', reason: 'Normal retirement at 60', raisedBy: 'Rose Chepkoech', raisedOn: '2026-06-30', cleared: 'all' },
        e('KHE-0211')
      ),
      interview: interview(['Retirement'], 5, false, 'Thirty years on the estate — thank you for the send-off.', '2026-09-25'),
      dues: { preparedBy: 'Rose Chepkoech', preparedOn: '2026-09-18', approvedBy: 'David Otieno', approvedOn: '2026-09-20', itemIds: [] },
      certificateIssuedOn: '2026-10-02'
    },
    {
      ...seedCase(
        { id: 'SEP-2026-010', orgId: 'org-factory', staffId: 'KHE-0914', kind: 'RESIGNATION', stage: 'CLEARANCE', noticeDate: '2026-09-15', lastDay: '2026-10-15', reason: 'Joined a competitor factory as shift supervisor', raisedBy: 'Rose Chepkoech', raisedOn: '2026-09-15', cleared: ['Supervisor', 'Stores', 'ICT', 'HR'] },
        e('KHE-0914')
      ),
      interview: interview(['Better pay elsewhere', 'Career growth'], 3, true, 'Wanted a supervisor role; none open in the factory this year.', '2026-10-06')
    },
    seedCase(
      { id: 'SEP-2026-011', orgId: 'org-kericho', staffId: 'KHE-0244', kind: 'RESIGNATION', stage: 'NOTICE', noticeDate: rel(-2), lastDay: '2026-10-30', reason: 'Moving to Nairobi for family reasons', raisedBy: 'Lucy Njeri', raisedOn: rel(-2), cleared: ['Supervisor'] },
      e('KHE-0244')
    ),
    seedCase(
      {
        id: 'SEP-2026-012',
        orgId: 'org-kericho',
        staffId: 'KHE-0303',
        kind: 'REDUNDANCY',
        stage: 'NOTICE',
        noticeDate: '2026-10-01',
        lastDay: '2026-11-30',
        reason: 'Fleet outsourced to a transport contractor — driver role abolished',
        raisedBy: 'Esther Muthoni',
        raisedOn: '2026-09-28',
        labourNoticeOn: '2026-09-28'
      },
      e('KHE-0303')
    ),
    seedCase(
      { id: 'SEP-2026-013', orgId: 'org-kericho', staffId: 'KHE-0295', kind: 'CONTRACT_EXPIRY', stage: 'NOTICE', noticeDate: '2026-10-02', lastDay: '2026-11-02', reason: 'Fixed-term contract not renewed — project complete', raisedBy: 'Rose Chepkoech', raisedOn: '2026-10-02' },
      e('KHE-0295')
    )
  ].filter((c) => e(c.staffId));
};

export const useSepState = (d: Deps): SepStateSlice => {
  const [exitCases, setExitCases] = useState<ExitCase[]>(() => seed(d.hrEmployees));
  const emp = (id: string) => d.hrEmployees.find((x) => x.staffId === id);
  const stamp = (c: ExitCase, by: string, text: string): ExitCase => ({ ...c, timeline: [...c.timeline, { at: today(), by, text }] });
  const patchCase = (id: string, f: (c: ExitCase) => ExitCase) => setExitCases((prev) => prev.map((c) => (c.id === id ? f(c) : c)));
  // Clearance done moves a case on from notice/clearance to final dues
  const advance = (c: ExitCase): ExitCase => (['NOTICE', 'CLEARANCE'].includes(c.stage) && clearanceDone(c) ? { ...c, stage: 'DUES' } : c.stage === 'NOTICE' && c.clearance.some((x) => x.status !== 'OPEN') ? { ...c, stage: 'CLEARANCE' } : c);

  const startExit: SepStateSlice['startExit'] = (x, by) => {
    const e = emp(x.staffId);
    if (!e) return null;
    if (exitCases.some((c) => c.staffId === x.staffId && !['WITHDRAWN', 'CLOSED'].includes(c.stage))) {
      d.addToast({ type: 'error', title: 'Exit already open', message: `${e.fullName} already has an exit case in progress.` });
      return null;
    }
    if (x.lastDay < x.noticeDate) {
      d.addToast({ type: 'error', title: 'Check the dates', message: 'The last working day is before the notice date.' });
      return null;
    }
    if (x.lastDay.slice(0, 7) < d.payrollOpenPeriod.key) {
      d.addToast({ type: 'error', title: 'Payroll period closed', message: `Final dues are paid through payroll — the last day must be in ${d.payrollOpenPeriod.label} or later.` });
      return null;
    }
    const id = `SEP-${x.lastDay.slice(0, 4)}-${String(exitCases.length + 9).padStart(3, '0')}`;
    const c: ExitCase = {
      id,
      orgId: e.orgId,
      staffId: e.staffId,
      kind: x.kind,
      stage: 'NOTICE',
      noticeDate: x.noticeDate,
      lastDay: x.lastDay,
      reason: x.reason,
      raisedBy: by,
      raisedOn: today(),
      caseRef: x.caseRef,
      labourNoticeOn: x.labourNoticeOn,
      waiveShortfall: x.waiveShortfall,
      clearance: clearanceTemplate(e, id),
      timeline: [{ at: today(), by, text: `${EXIT_LABEL[x.kind]} recorded — last working day ${x.lastDay}${x.caseRef ? ` (case ${x.caseRef})` : ''}` }]
    };
    setExitCases((prev) => [c, ...prev]);
    d.addToast({ type: 'success', title: 'Exit started', message: `${e.fullName}: ${EXIT_LABEL[x.kind].toLowerCase()}, last day ${x.lastDay}. Clearance requests went to the five departments.` });
    return c;
  };

  const updateExit: SepStateSlice['updateExit'] = (id, patch, text, by = 'HR office') => patchCase(id, (c) => (text ? stamp({ ...c, ...patch }, by, text) : { ...c, ...patch }));

  const setClearance: SepStateSlice['setClearance'] = (id, itemId, status, by, note) =>
    patchCase(id, (c) => {
      const item = c.clearance.find((x) => x.id === itemId);
      const next = { ...c, clearance: c.clearance.map((x) => (x.id === itemId ? { ...x, status, by, at: today(), note } : x)) };
      return advance(stamp(next, by, `${item?.dept}: ${item?.label} — ${status === 'NOT_RETURNED' ? `not returned${item?.value ? ` (KES ${item.value.toLocaleString()} to recover)` : ''}` : status.toLowerCase()}${note ? ` (${note})` : ''}`));
    });

  const clearDept: SepStateSlice['clearDept'] = (id, dept, by) =>
    patchCase(id, (c) => advance(stamp({ ...c, clearance: c.clearance.map((x) => (x.dept === dept && x.status === 'OPEN' ? { ...x, status: 'CLEARED', by, at: today() } : x)) }, by, `${dept} cleared`)));

  const saveExitInterview: SepStateSlice['saveExitInterview'] = (id, i) => {
    patchCase(id, (c) => {
      const hr = c.clearance.find((x) => x.label === 'Exit interview held');
      const next = { ...c, interview: i, clearance: c.clearance.map((x) => (x === hr && x.status === 'OPEN' ? { ...x, status: 'CLEARED' as const, by: i.by, at: i.doneOn } : x)) };
      return advance(stamp(next, i.by, 'Exit interview recorded'));
    });
    d.addToast({ type: 'success', title: 'Exit interview saved', message: 'Reasons feed the turnover analysis.' });
  };

  const prepareDues: SepStateSlice['prepareDues'] = (id, by) => {
    const c = exitCases.find((x) => x.id === id);
    if (!c) return;
    if (!clearanceDone(c)) {
      d.addToast({ type: 'error', title: 'Clearance open', message: 'Every clearance item must be cleared, waived or marked not returned first.' });
      return;
    }
    patchCase(id, (x) => stamp({ ...x, stage: 'DUES', dues: { preparedBy: by, preparedOn: today(), itemIds: [] } }, by, 'Final dues prepared for Finance approval'));
    d.addToast({ type: 'info', title: 'Sent to Finance', message: 'Final dues are waiting for approval by someone other than the preparer.' });
  };

  const approveDues: SepStateSlice['approveDues'] = (id, by, bond) => {
    const c = exitCases.find((x) => x.id === id);
    const e = c && emp(c.staffId);
    if (!c || !e || !c.dues) return false;
    if (c.dues.preparedBy === by) {
      d.addToast({ type: 'error', title: 'Segregation of duties', message: `${by} prepared these dues and cannot approve them.` });
      return false;
    }
    if (c.lastDay.slice(0, 7) < d.payrollOpenPeriod.key) {
      d.addToast({ type: 'error', title: 'Payroll period closed', message: `${c.lastDay.slice(0, 7)} is paid. Move the last day into ${d.payrollOpenPeriod.label} or later.` });
      return false;
    }
    const drafts = finalDuesItems(c, e, bond);
    if (drafts.length) d.postPayItems(drafts, by);
    if (bond && bond.amount > 0) d.onBondRecovered?.(e.staffId, c.lastDay);
    // Payroll now pays the exit month: pro-rated salary, leave pay, gratuity or severance, loans recovered in full
    d.setExitTypes((m) => ({ ...m, [e.staffId]: engineExitType(c.kind) }));
    d.updateHrEmployee(e.staffId, { exitDate: c.lastDay, status: c.lastDay < today() ? 'TERMINATED' : e.status });
    patchCase(id, (x) => stamp({ ...x, stage: 'APPROVED', dues: { ...x.dues!, approvedBy: by, approvedOn: today(), itemIds: drafts.map((g) => g.reference) } }, by, `Final dues approved — paid with the ${c.lastDay.slice(0, 7)} payroll`));
    d.addToast({ type: 'success', title: 'Final dues approved', message: `${e.fullName} will be paid in the ${c.lastDay.slice(0, 7)} payroll${drafts.length ? ` with ${drafts.length} exit item${drafts.length === 1 ? '' : 's'}` : ''}.` });
    return true;
  };

  const withdrawExit: SepStateSlice['withdrawExit'] = (id, by, reason) => {
    const c = exitCases.find((x) => x.id === id);
    if (!c) return;
    if (['APPROVED', 'PAID', 'CLOSED'].includes(c.stage)) {
      d.addToast({ type: 'error', title: 'Too late to withdraw', message: 'Final dues are approved. Reverse them with Finance first.' });
      return;
    }
    patchCase(id, (x) => stamp({ ...x, stage: 'WITHDRAWN' }, by, `Withdrawn — ${reason}`));
    d.addToast({ type: 'info', title: 'Exit withdrawn', message: `${emp(c.staffId)?.fullName} stays on the payroll.` });
  };

  const issueCertificate: SepStateSlice['issueCertificate'] = (id, by) => {
    patchCase(id, (x) => stamp({ ...x, certificateIssuedOn: today() }, by, 'Certificate of service issued (Employment Act s.51)'));
  };

  // Paid once the exit month's payroll is closed; closed once the certificate is out
  const live = exitCases.map((c): ExitCase => {
    let stage: ExitStage = c.stage;
    if (stage === 'APPROVED' && c.lastDay.slice(0, 7) < d.payrollOpenPeriod.key) stage = 'PAID';
    if (stage === 'PAID' && c.certificateIssuedOn) stage = 'CLOSED';
    return stage === c.stage ? c : { ...c, stage };
  });

  return {
    exitCases: live,
    tenantExitCases: live.filter((c) => c.orgId === d.selectedOrgId),
    startExit,
    updateExit,
    setClearance,
    clearDept,
    saveExitInterview,
    prepareDues,
    approveDues,
    withdrawExit,
    issueCertificate,
    bondFor: (staffId, exitDate) => d.bondRecovery?.(staffId, exitDate)
  };
};

