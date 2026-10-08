import { useCallback, useMemo, useState } from 'react';
import type { PeopleDeps } from './sliceDeps';
import {
  LOAN_DAYS,
  SEED_AUDITS,
  SEED_BOOKS,
  SEED_COHORTS,
  SEED_LICENCES,
  SEED_LOANS,
  SEED_PLACEMENTS,
  SEED_RESERVATIONS,
  SEED_STIPENDS,
  plusDays,
  todayIso,
  type AuditFinding,
  type FindingStatus,
  type InternCohort,
  type InternPlacement,
  type InternStipend,
  type LibraryBook,
  type LibraryLoan,
  type LibraryReservation,
  type Licence,
  type OshAudit
} from '../data/registersSeed';

const ACTOR = 'Rose Chepkoech';
const seq = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`;

export type NewLicence = Omit<Licence, 'id' | 'orgId' | 'history' | 'renewal'>;
export type NewAudit = Omit<OshAudit, 'id' | 'orgId' | 'findings'>;
export type NewFinding = Omit<AuditFinding, 'id' | 'status' | 'closedOn'>;
export type NewBook = Omit<LibraryBook, 'id' | 'orgId'>;
export type NewCohort = Omit<InternCohort, 'id' | 'orgId' | 'status'>;
export type NewApplicant = Pick<InternPlacement, 'cohortId' | 'name' | 'phone' | 'email' | 'institution' | 'course' | 'year'> & Partial<Pick<InternPlacement, 'letterRef' | 'insurance'>>;

/** Licences & audits, staff library and internship / attachment intakes exposed through the app context. */
export interface RegistersStateSlice {
  registersToday: string;
  /* licences & permits */
  licences: Licence[];
  addLicence: (l: NewLicence) => void;
  startLicenceRenewal: (id: string, note: string) => void;
  cancelLicenceRenewal: (id: string) => void;
  renewLicence: (id: string, r: { issuedOn: string; newExpiry: string; fee: number; reference: string; number?: string }) => void;
  /* external OSH audits */
  oshAudits: OshAudit[];
  addOshAudit: (a: NewAudit) => void;
  addAuditFinding: (auditId: string, f: NewFinding) => void;
  setAuditFindingStatus: (auditId: string, findingId: string, status: FindingStatus) => void;
  /* library */
  libraryBooks: LibraryBook[];
  libraryLoans: LibraryLoan[];
  libraryReservations: LibraryReservation[];
  addBook: (b: NewBook) => void;
  setBookCopies: (bookId: string, copies: number) => void;
  /** Lends a copy for `days` (default 14); false when no copy is free */
  issueBook: (bookId: string, staffId: string, days?: number) => boolean;
  returnBook: (loanId: string) => void;
  /** One renewal per loan, for another loan period from the current due date */
  renewLoan: (loanId: string) => boolean;
  /** Writes the copy off and deducts `charge` through payroll (Other deduction) */
  markBookLost: (loanId: string, charge: number) => void;
  reserveBook: (bookId: string, staffId: string) => void;
  cancelReservation: (id: string) => void;
  /* internships & industrial attachment */
  internCohorts: InternCohort[];
  internPlacements: InternPlacement[];
  internStipends: InternStipend[];
  addInternCohort: (c: NewCohort) => void;
  setInternCohortStatus: (id: string, status: InternCohort['status']) => void;
  addInternApplicant: (a: NewApplicant) => void;
  updateInternPlacement: (id: string, patch: Partial<InternPlacement>) => void;
  /** Places an applicant; refused without the institution letter and insurance cover */
  placeIntern: (id: string, department: string, supervisorId: string) => boolean;
  evaluateIntern: (id: string, rating: number, comment: string, issueCertificate: boolean) => void;
  /** Adds pending stipend lines for every placed intern of the cohort for `month` (YYYY-MM); returns how many */
  generateStipends: (cohortId: string, month: string) => number;
  setStipendStatus: (ids: string[], status: InternStipend['status']) => void;
}

export const useRegistersState = (d: PeopleDeps): RegistersStateSlice => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, postPayItems, addToast } = d;
  const today = todayIso();
  const [licences, setLicences] = useState<Licence[]>(SEED_LICENCES);
  const [oshAudits, setAudits] = useState<OshAudit[]>(SEED_AUDITS);
  const [libraryBooks, setBooks] = useState<LibraryBook[]>(SEED_BOOKS);
  const [libraryLoans, setLoans] = useState<LibraryLoan[]>(SEED_LOANS);
  const [libraryReservations, setReservations] = useState<LibraryReservation[]>(SEED_RESERVATIONS);
  const [internCohorts, setCohorts] = useState<InternCohort[]>(SEED_COHORTS);
  const [internPlacements, setPlacements] = useState<InternPlacement[]>(SEED_PLACEMENTS);
  const [internStipends, setStipends] = useState<InternStipend[]>(SEED_STIPENDS);

  const nameOf = useCallback((id: string) => hrEmployees.find((e) => e.staffId === id)?.fullName ?? id, [hrEmployees]);

  /* ---------------- licences */

  const addLicence = useCallback(
    (l: NewLicence) => {
      setLicences((list) => [...list, { ...l, id: seq('LIC', list.length + 1), orgId: selectedOrgId, history: [] }]);
      addToast({ type: 'success', title: 'Licence added', message: `${l.type} (${l.number}) is on the register.` });
    },
    [selectedOrgId, addToast]
  );

  const startLicenceRenewal = useCallback(
    (id: string, note: string) => {
      setLicences((list) => list.map((l) => (l.id === id ? { ...l, renewal: { startedOn: today, by: ACTOR, note } } : l)));
      addToast({ type: 'info', title: 'Renewal started', message: 'The licence shows as renewal in progress until the new one is recorded.' });
    },
    [today, addToast]
  );

  const cancelLicenceRenewal = useCallback((id: string) => setLicences((list) => list.map((l) => (l.id === id ? { ...l, renewal: undefined } : l))), []);

  const renewLicence = useCallback<RegistersStateSlice['renewLicence']>(
    (id, r) => {
      setLicences((list) =>
        list.map((l) =>
          l.id === id
            ? {
                ...l,
                renewal: undefined,
                issuedOn: r.issuedOn,
                expiresOn: r.newExpiry,
                fee: r.fee,
                number: r.number?.trim() || l.number,
                history: [{ renewedOn: r.issuedOn, previousExpiry: l.expiresOn, newExpiry: r.newExpiry, fee: r.fee, reference: r.reference, by: ACTOR }, ...l.history]
              }
            : l
        )
      );
      addToast({ type: 'success', title: 'Licence renewed', message: `Now valid to ${r.newExpiry}.` });
    },
    [addToast]
  );

  /* ---------------- audits */

  const addOshAudit = useCallback(
    (a: NewAudit) => {
      setAudits((list) => [{ ...a, id: `AUD-${a.date.slice(0, 4)}-${String(list.length + 1).padStart(2, '0')}`, orgId: selectedOrgId, findings: [] }, ...list]);
      addToast({ type: 'success', title: 'Audit recorded', message: `${a.type} by ${a.auditor}. Add the findings next.` });
    },
    [selectedOrgId, addToast]
  );

  const addAuditFinding = useCallback(
    (auditId: string, f: NewFinding) => setAudits((list) => list.map((a) => (a.id === auditId ? { ...a, findings: [...a.findings, { ...f, id: `F${a.findings.length + 1}`, status: 'Open' }] } : a))),
    []
  );

  const setAuditFindingStatus = useCallback(
    (auditId: string, findingId: string, status: FindingStatus) =>
      setAudits((list) =>
        list.map((a) => (a.id === auditId ? { ...a, findings: a.findings.map((x) => (x.id === findingId ? { ...x, status, closedOn: status === 'Closed' ? today : undefined } : x)) } : a))
      ),
    [today]
  );

  /* ---------------- library */

  const onLoan = useCallback((bookId: string) => libraryLoans.filter((l) => l.bookId === bookId && l.status === 'On loan').length, [libraryLoans]);

  const addBook = useCallback(
    (b: NewBook) => {
      setBooks((list) => [...list, { ...b, id: seq('BK', list.length + 1), orgId: selectedOrgId }]);
      addToast({ type: 'success', title: 'Book catalogued', message: `${b.title}: ${b.copies} ${b.copies === 1 ? 'copy' : 'copies'} on shelf ${b.shelf}.` });
    },
    [selectedOrgId, addToast]
  );

  const setBookCopies = useCallback(
    (bookId: string, copies: number) => {
      const min = onLoan(bookId);
      if (copies < min) {
        addToast({ type: 'warning', title: 'Copies on loan', message: `${min} copies are out on loan; stock cannot go below that.` });
        return;
      }
      setBooks((list) => list.map((b) => (b.id === bookId ? { ...b, copies } : b)));
    },
    [onLoan, addToast]
  );

  const issueBook = useCallback(
    (bookId: string, staffId: string, days = LOAN_DAYS) => {
      const b = libraryBooks.find((x) => x.id === bookId);
      if (!b || b.copies - onLoan(bookId) <= 0) {
        addToast({ type: 'warning', title: 'No copy available', message: 'All copies are on loan. Reserve it instead and the borrower is next in line.' });
        return false;
      }
      setLoans((list) => [{ id: `LN-${String(list.length + 100).padStart(4, '0')}`, orgId: b.orgId, bookId, staffId, issuedOn: today, dueOn: plusDays(today, days), renewed: false, status: 'On loan', issuedBy: ACTOR }, ...list]);
      // A waiting reservation by this borrower is now met
      setReservations((list) => list.map((r) => (r.bookId === bookId && r.staffId === staffId && r.status === 'Waiting' ? { ...r, status: 'Fulfilled' } : r)));
      addToast({ type: 'success', title: 'Book issued', message: `${b.title} to ${nameOf(staffId)}, due ${plusDays(today, days)}.` });
      return true;
    },
    [libraryBooks, onLoan, today, nameOf, addToast]
  );

  const returnBook = useCallback(
    (loanId: string) => {
      const ln = libraryLoans.find((l) => l.id === loanId);
      setLoans((list) => list.map((l) => (l.id === loanId ? { ...l, status: 'Returned', returnedOn: today } : l)));
      const next = ln && libraryReservations.find((r) => r.bookId === ln.bookId && r.status === 'Waiting');
      addToast({
        type: 'success',
        title: 'Book returned',
        message: next ? `Back on the shelf. ${nameOf(next.staffId)} reserved it and is next in line.` : 'Back on the shelf.'
      });
    },
    [libraryLoans, libraryReservations, today, nameOf, addToast]
  );

  const renewLoan = useCallback(
    (loanId: string) => {
      const ln = libraryLoans.find((l) => l.id === loanId);
      if (!ln || ln.renewed) return false;
      if (libraryReservations.some((r) => r.bookId === ln.bookId && r.status === 'Waiting' && r.staffId !== ln.staffId)) {
        addToast({ type: 'warning', title: 'Cannot renew', message: 'Someone else has reserved this book. Ask the borrower to return it.' });
        return false;
      }
      const due = plusDays(ln.dueOn < today ? today : ln.dueOn, LOAN_DAYS);
      setLoans((list) => list.map((l) => (l.id === loanId ? { ...l, dueOn: due, renewed: true } : l)));
      addToast({ type: 'success', title: 'Loan renewed', message: `Now due ${due}. Loans can be renewed once.` });
      return true;
    },
    [libraryLoans, libraryReservations, today, addToast]
  );

  const markBookLost = useCallback(
    (loanId: string, charge: number) => {
      const ln = libraryLoans.find((l) => l.id === loanId);
      if (!ln) return;
      const b = libraryBooks.find((x) => x.id === ln.bookId);
      const ref = `LIB-LOST-${ln.id}`;
      if (charge > 0)
        postPayItems(
          [
            {
              staffId: ln.staffId,
              componentId: 'OTHER_DEDUCTION',
              amount: Math.round(charge),
              period: payrollOpenPeriod.key,
              recurring: false,
              reference: ref,
              note: `Library: lost book "${b?.title ?? ln.bookId}" (loan ${ln.id})`,
              source: 'Manual'
            }
          ],
          ACTOR
        );
      setLoans((list) => list.map((l) => (l.id === loanId ? { ...l, status: 'Lost', charge, chargeRef: charge > 0 ? ref : undefined } : l)));
      // The lost copy leaves stock
      setBooks((list) => list.map((x) => (x.id === ln.bookId ? { ...x, copies: Math.max(0, x.copies - 1) } : x)));
      addToast({
        type: 'info',
        title: 'Copy written off',
        message: charge > 0 ? `KES ${Math.round(charge).toLocaleString()} will be deducted from ${nameOf(ln.staffId)}'s ${payrollOpenPeriod.label} pay.` : 'No charge to the borrower.'
      });
    },
    [libraryLoans, libraryBooks, postPayItems, payrollOpenPeriod, nameOf, addToast]
  );

  const reserveBook = useCallback(
    (bookId: string, staffId: string) => {
      if (libraryReservations.some((r) => r.bookId === bookId && r.staffId === staffId && r.status === 'Waiting')) {
        addToast({ type: 'info', title: 'Already reserved', message: `${nameOf(staffId)} is already in the queue for this book.` });
        return;
      }
      const b = libraryBooks.find((x) => x.id === bookId);
      setReservations((list) => [...list, { id: `RS-${String(list.length + 11).padStart(3, '0')}`, orgId: b?.orgId ?? selectedOrgId, bookId, staffId, on: today, status: 'Waiting' }]);
      addToast({ type: 'success', title: 'Reserved', message: `${nameOf(staffId)} is in the queue for ${b?.title ?? 'the book'}.` });
    },
    [libraryReservations, libraryBooks, selectedOrgId, today, nameOf, addToast]
  );

  const cancelReservation = useCallback((id: string) => setReservations((list) => list.map((r) => (r.id === id ? { ...r, status: 'Cancelled' } : r))), []);

  /* ---------------- internships & attachments */

  const addInternCohort = useCallback(
    (c: NewCohort) => {
      const prefix = c.programme === 'Industrial attachment' ? 'ATT' : 'INT';
      setCohorts((list) => [...list, { ...c, id: `${prefix}-${c.startOn.slice(0, 4)}-${list.length + 1}`, orgId: selectedOrgId, status: 'Open for applications' }]);
      addToast({ type: 'success', title: 'Intake opened', message: `${c.name} is open for applications.` });
    },
    [selectedOrgId, addToast]
  );

  const setInternCohortStatus = useCallback((id: string, status: InternCohort['status']) => setCohorts((list) => list.map((c) => (c.id === id ? { ...c, status } : c))), []);

  const addInternApplicant = useCallback(
    (a: NewApplicant) => {
      setPlacements((list) => [...list, { ...a, id: `IP-${String(list.length + 1).padStart(2, '0')}`, orgId: selectedOrgId, status: 'Applied' }]);
      addToast({ type: 'success', title: 'Applicant added', message: `${a.name} (${a.institution}).` });
    },
    [selectedOrgId, addToast]
  );

  const updateInternPlacement = useCallback((id: string, patch: Partial<InternPlacement>) => setPlacements((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))), []);

  const placeIntern = useCallback(
    (id: string, department: string, supervisorId: string) => {
      const p = internPlacements.find((x) => x.id === id);
      if (!p) return false;
      if (!p.letterRef || !p.insurance) {
        addToast({ type: 'warning', title: 'Documents missing', message: 'Record the institution letter and insurance cover (WIBA or student cover) before placing.' });
        return false;
      }
      setPlacements((list) => list.map((x) => (x.id === id ? { ...x, department, supervisorId, status: 'Placed' } : x)));
      addToast({ type: 'success', title: 'Placed', message: `${p.name} joins ${department} under ${nameOf(supervisorId)}.` });
      return true;
    },
    [internPlacements, nameOf, addToast]
  );

  const evaluateIntern = useCallback(
    (id: string, rating: number, comment: string, issueCertificate: boolean) => {
      setPlacements((list) =>
        list.map((p) =>
          p.id === id ? { ...p, status: 'Completed', evaluation: { rating, comment, on: today, certificateNo: issueCertificate ? `CERT/${p.cohortId}/${p.id}` : undefined } } : p
        )
      );
      addToast({ type: 'success', title: 'Evaluation saved', message: issueCertificate ? 'Certificate of completion issued.' : 'Completed without a certificate.' });
    },
    [today, addToast]
  );

  const generateStipends = useCallback(
    (cohortId: string, month: string) => {
      const c = internCohorts.find((x) => x.id === cohortId);
      if (!c || c.stipend <= 0) return 0;
      const placed = internPlacements.filter((p) => p.cohortId === cohortId && p.status === 'Placed');
      const fresh = placed
        .filter((p) => !internStipends.some((s) => s.placementId === p.id && s.month === month))
        .map<InternStipend>((p) => ({ id: `STP-${p.id}-${month}`, orgId: c.orgId, placementId: p.id, cohortId, month, amount: c.stipend, status: 'Pending', ref: `STP/${month}/${p.id}` }));
      setStipends((list) => [...list, ...fresh]);
      addToast(
        fresh.length
          ? { type: 'success', title: 'Stipend list prepared', message: `${fresh.length} lines for ${month}, KES ${(fresh.length * c.stipend).toLocaleString()} in total.` }
          : { type: 'info', title: 'Nothing to add', message: `Every placed intern already has a ${month} line.` }
      );
      return fresh.length;
    },
    [internCohorts, internPlacements, internStipends, addToast]
  );

  const setStipendStatus = useCallback(
    (ids: string[], status: InternStipend['status']) => setStipends((list) => list.map((s) => (ids.includes(s.id) ? { ...s, status, paidOn: status === 'Paid' ? today : s.paidOn } : s))),
    [today]
  );

  return useMemo(
    () => ({
      registersToday: today,
      licences,
      addLicence,
      startLicenceRenewal,
      cancelLicenceRenewal,
      renewLicence,
      oshAudits,
      addOshAudit,
      addAuditFinding,
      setAuditFindingStatus,
      libraryBooks,
      libraryLoans,
      libraryReservations,
      addBook,
      setBookCopies,
      issueBook,
      returnBook,
      renewLoan,
      markBookLost,
      reserveBook,
      cancelReservation,
      internCohorts,
      internPlacements,
      internStipends,
      addInternCohort,
      setInternCohortStatus,
      addInternApplicant,
      updateInternPlacement,
      placeIntern,
      evaluateIntern,
      generateStipends,
      setStipendStatus
    }),
    [
      today,
      licences,
      addLicence,
      startLicenceRenewal,
      cancelLicenceRenewal,
      renewLicence,
      oshAudits,
      addOshAudit,
      addAuditFinding,
      setAuditFindingStatus,
      libraryBooks,
      libraryLoans,
      libraryReservations,
      addBook,
      setBookCopies,
      issueBook,
      returnBook,
      renewLoan,
      markBookLost,
      reserveBook,
      cancelReservation,
      internCohorts,
      internPlacements,
      internStipends,
      addInternCohort,
      setInternCohortStatus,
      addInternApplicant,
      updateInternPlacement,
      placeIntern,
      evaluateIntern,
      generateStipends,
      setStipendStatus
    ]
  );
};
