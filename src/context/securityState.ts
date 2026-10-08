import { useCallback, useMemo, useState } from 'react';
import type { PeopleDeps } from './sliceDeps';
import {
  SEED_CONSIGNMENTS,
  SEED_GATE_PASSES,
  SEED_OB,
  SEED_PATROLS,
  SEED_RECEIPTS,
  SEED_ROSTER,
  SEED_SEC_INCIDENTS,
  SEED_SYSTEMS,
  SEED_VISITORS,
  SITE,
  nowStamp,
  sealMismatch,
  todayIso,
  type Checkpoint,
  type Consignment,
  type GateCheck,
  type GatePass,
  type GoodsReceipt,
  type GuardShift,
  type InsuranceClaim,
  type Investigation,
  type InvestigationOutcome,
  type OccurrenceEntry,
  type PatrolRound,
  type SecIncident,
  type SecuritySystem,
  type Visitor
} from '../data/securitySeed';

export type NewGatePass = Omit<GatePass, 'id' | 'orgId' | 'raisedOn' | 'status' | 'decision' | 'check' | 'returned'>;
export type NewReceipt = Omit<GoodsReceipt, 'id' | 'orgId' | 'at'>;
export type NewVisitor = Omit<Visitor, 'id' | 'orgId' | 'checkIn' | 'checkOut'>;
export type NewConsignment = Pick<Consignment, 'kind' | 'cargo' | 'value' | 'from' | 'to' | 'route' | 'vehicleReg' | 'driver' | 'requestedBy' | 'plannedDeparture'>;
export type NewSecIncident = Pick<SecIncident, 'type' | 'site' | 'occurredAt' | 'reportedBy' | 'description' | 'lossValue' | 'suspect' | 'consignmentId'>;

/** Gate passes, visitors, escorted cargo, guard operations and security investigations. */
export interface SecurityStateSlice {
  securityToday: string;
  /* gate passes */
  gatePasses: GatePass[];
  /** Raises a pass for department-head approval; returns its id */
  raiseGatePass: (p: NewGatePass) => string;
  decideGatePass: (id: string, approve: boolean, note: string) => void;
  cancelGatePass: (id: string) => void;
  /** Guard's check at the gate; the pass is then marked as exited */
  gateCheckOut: (id: string, check: Omit<GateCheck, 'at'>) => void;
  recordGateReturn: (id: string, r: { guard: string; note: string; complete: boolean }) => void;
  /* incoming goods */
  goodsReceipts: GoodsReceipt[];
  recordGoodsReceipt: (r: NewReceipt) => void;
  /* visitors */
  visitors: Visitor[];
  registerVisitor: (v: NewVisitor, checkInNow: boolean) => void;
  checkInVisitor: (id: string, d: Pick<Visitor, 'badgeNo' | 'vehicleReg' | 'ppeIssued' | 'inductionDone'>) => void;
  checkOutVisitor: (id: string) => void;
  /* cargo in transit */
  consignments: Consignment[];
  requestEscort: (c: NewConsignment) => void;
  decideEscort: (id: string, approve: boolean, note: string, by: string) => void;
  assignEscort: (id: string, guards: string[], police: string) => void;
  dispatchConsignment: (id: string, seals: string[]) => void;
  addCheckpoint: (id: string, cp: Omit<Checkpoint, 'at'>) => void;
  /** Records arrival seals; a mismatch marks the consignment as an incident and opens a breach-of-seal incident (returns its id) */
  recordArrival: (id: string, seals: string[]) => string | undefined;
  /* guard operations */
  guardShifts: GuardShift[];
  addGuardShift: (s: Omit<GuardShift, 'id' | 'orgId' | 'site'>) => void;
  patrolRounds: PatrolRound[];
  occurrences: OccurrenceEntry[];
  addOccurrence: (e: Omit<OccurrenceEntry, 'id' | 'orgId' | 'at' | 'site'>) => void;
  /* incidents & investigations */
  secIncidents: SecIncident[];
  reportSecIncident: (i: NewSecIncident) => string;
  startInvestigation: (id: string, investigatorId: string) => void;
  updateInvestigation: (id: string, patch: Partial<Pick<Investigation, 'cctvReviewed' | 'findings'>>) => void;
  addStatement: (id: string, s: { by: string; summary: string }) => void;
  addEvidence: (id: string, e: { item: string; ref: string }) => void;
  closeInvestigation: (id: string, outcome: InvestigationOutcome, obNumber?: string) => void;
  setInsuranceClaim: (id: string, claim: InsuranceClaim) => void;
  addRecovery: (id: string, value: number, note: string) => void;
  linkDisciplinaryCase: (id: string, caseId: string) => void;
  /** Simulated feeds from CCTV, access control and the patrol app */
  securitySystems: SecuritySystem[];
}

export const useSecurityState = (d: PeopleDeps): SecurityStateSlice => {
  const { selectedOrgId, addToast } = d;
  const today = todayIso();
  const [gatePasses, setPasses] = useState<GatePass[]>(SEED_GATE_PASSES);
  const [goodsReceipts, setReceipts] = useState<GoodsReceipt[]>(SEED_RECEIPTS);
  const [visitors, setVisitors] = useState<Visitor[]>(SEED_VISITORS);
  const [consignments, setConsignments] = useState<Consignment[]>(SEED_CONSIGNMENTS);
  const [guardShifts, setShifts] = useState<GuardShift[]>(SEED_ROSTER);
  const [patrolRounds] = useState<PatrolRound[]>(SEED_PATROLS);
  const [occurrences, setOb] = useState<OccurrenceEntry[]>(SEED_OB);
  const [secIncidents, setIncidents] = useState<SecIncident[]>(SEED_SEC_INCIDENTS);
  const [securitySystems] = useState<SecuritySystem[]>(SEED_SYSTEMS);

  const patchPass = (id: string, f: (p: GatePass) => GatePass) => setPasses((list) => list.map((p) => (p.id === id ? f(p) : p)));
  const patchCon = (id: string, f: (c: Consignment) => Consignment) => setConsignments((list) => list.map((c) => (c.id === id ? f(c) : c)));
  const patchInc = (id: string, f: (i: SecIncident) => SecIncident) => setIncidents((list) => list.map((i) => (i.id === id ? f(i) : i)));
  const patchInv = (id: string, f: (v: Investigation) => Investigation) => patchInc(id, (i) => (i.investigation ? { ...i, investigation: f(i.investigation) } : i));

  /* ---------------- gate passes */

  const raiseGatePass = useCallback(
    (p: NewGatePass) => {
      const year = today.slice(0, 4);
      const nums = gatePasses.filter((x) => x.id.startsWith(`GP-${year}-`)).map((x) => Number(x.id.slice(-4)));
      const id = `GP-${year}-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
      setPasses((list) => [{ ...p, id, orgId: selectedOrgId, raisedOn: today, status: 'Awaiting approval' }, ...list]);
      addToast({ type: 'success', title: `Gate pass ${id} raised`, message: 'Sent to the department head for approval.' });
      return id;
    },
    [gatePasses, today, selectedOrgId, addToast]
  );

  const decideGatePass = useCallback(
    (id: string, approve: boolean, note: string) => {
      patchPass(id, (p) => ({ ...p, status: approve ? 'Approved' : 'Rejected', decision: { by: p.approverId, on: today, note: note || (approve ? 'Approved' : 'Rejected') } }));
      addToast({ type: approve ? 'success' : 'info', title: approve ? 'Pass approved' : 'Pass rejected', message: approve ? 'The gate can now check the items out.' : 'The requester has been told.' });
    },
    [today, addToast]
  );

  const cancelGatePass = useCallback((id: string) => patchPass(id, (p) => ({ ...p, status: 'Cancelled' })), []);

  const gateCheckOut = useCallback(
    (id: string, check: Omit<GateCheck, 'at'>) => {
      const p = gatePasses.find((x) => x.id === id);
      patchPass(id, (x) => ({ ...x, status: 'Exited', check: { ...check, at: nowStamp() } }));
      const flagged = !!check.discrepancy || (p ? check.counted.some((c, i) => c !== p.items[i]?.qty) : false);
      addToast(
        flagged
          ? { type: 'warning', title: 'Exit recorded with a discrepancy', message: `${id} is flagged for the security officer to follow up.` }
          : { type: 'success', title: 'Exit recorded', message: `${id} checked and out at ${nowStamp().slice(11)}.` }
      );
    },
    [gatePasses, addToast]
  );

  const recordGateReturn = useCallback(
    (id: string, r: { guard: string; note: string; complete: boolean }) => {
      patchPass(id, (p) => ({ ...p, status: 'Returned', returned: { ...r, at: nowStamp() } }));
      addToast({ type: r.complete ? 'success' : 'warning', title: 'Return recorded', message: r.complete ? 'All items are back.' : 'Part return recorded; note what is still out.' });
    },
    [addToast]
  );

  /* ---------------- incoming goods */

  const recordGoodsReceipt = useCallback(
    (r: NewReceipt) => {
      setReceipts((list) => [{ ...r, id: `GR-${String(9000 + list.length)}`, orgId: selectedOrgId, at: nowStamp() }, ...list]);
      addToast({ type: r.result === 'Cleared to stores' ? 'success' : 'warning', title: r.result, message: `${r.supplier}, ${r.dnNo}.` });
    },
    [selectedOrgId, addToast]
  );

  /* ---------------- visitors */

  const registerVisitor = useCallback(
    (v: NewVisitor, checkInNow: boolean) => {
      setVisitors((list) => [{ ...v, id: `VIS-${String(8000 + list.length)}`, orgId: selectedOrgId, checkIn: checkInNow ? nowStamp() : undefined }, ...list]);
      addToast({ type: 'success', title: checkInNow ? 'Visitor checked in' : 'Visitor pre-registered', message: `${v.name} (${v.company}).` });
    },
    [selectedOrgId, addToast]
  );

  const checkInVisitor = useCallback((id: string, dd: Pick<Visitor, 'badgeNo' | 'vehicleReg' | 'ppeIssued' | 'inductionDone'>) => {
    setVisitors((list) => list.map((v) => (v.id === id ? { ...v, ...dd, checkIn: nowStamp() } : v)));
  }, []);

  const checkOutVisitor = useCallback(
    (id: string) => {
      setVisitors((list) => list.map((v) => (v.id === id ? { ...v, checkOut: nowStamp() } : v)));
      addToast({ type: 'info', title: 'Checked out', message: 'Collect the badge and any PPE issued.' });
    },
    [addToast]
  );

  /* ---------------- cargo in transit */

  const requestEscort = useCallback(
    (c: NewConsignment) => {
      setConsignments((list) => {
        const n = list.length + 121;
        const prefix = c.kind === 'Cash in transit' ? 'CIT' : c.kind.includes('Mombasa') ? 'MSA' : 'WH';
        return [{ ...c, id: `CN-${n}`, orgId: selectedOrgId, ref: `${selectedOrgId === 'org-factory' ? 'KCF' : 'SEC'}/${prefix}/${today.slice(0, 4)}/${n}`, requestedOn: today, escortGuards: [], sealsLoading: [], checkpoints: [], status: 'Escort requested' }, ...list];
      });
      addToast({ type: 'success', title: 'Escort requested', message: 'Awaiting approval before guards are assigned.' });
    },
    [selectedOrgId, today, addToast]
  );

  const decideEscort = useCallback(
    (id: string, approve: boolean, note: string, by: string) => {
      patchCon(id, (c) => ({ ...c, status: approve ? 'Escort approved' : 'Rejected', approval: { by, on: today, note: note || (approve ? 'Approved' : 'Rejected') } }));
      addToast({ type: approve ? 'success' : 'info', title: approve ? 'Escort approved' : 'Escort request rejected', message: approve ? 'Assign guards and police next.' : 'The requester has been told.' });
    },
    [today, addToast]
  );

  const assignEscort = useCallback((id: string, guards: string[], police: string) => {
    patchCon(id, (c) => ({ ...c, escortGuards: guards, police: police || undefined, status: 'Loading' }));
  }, []);

  const dispatchConsignment = useCallback(
    (id: string, seals: string[]) => {
      patchCon(id, (c) => ({ ...c, sealsLoading: seals, departure: nowStamp(), status: 'In transit' }));
      addToast({ type: 'success', title: 'Consignment departed', message: `Seals ${seals.join(', ')} recorded at loading.` });
    },
    [addToast]
  );

  const addCheckpoint = useCallback((id: string, cp: Omit<Checkpoint, 'at'>) => patchCon(id, (c) => ({ ...c, checkpoints: [...c.checkpoints, { ...cp, at: nowStamp() }] })), []);

  const nextIncidentId = useCallback(
    (list: SecIncident[]) => {
      const year = today.slice(0, 4);
      const nums = list.filter((x) => x.id.startsWith(`SI-${year}-`)).map((x) => Number(x.id.slice(-3)));
      return `SI-${year}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
    },
    [today]
  );

  const recordArrival = useCallback(
    (id: string, seals: string[]) => {
      const c = consignments.find((x) => x.id === id);
      if (!c) return undefined;
      const arrived = { ...c, sealsArrival: seals, arrival: nowStamp() };
      if (!sealMismatch(arrived)) {
        patchCon(id, () => ({ ...arrived, status: 'Arrived' }));
        addToast({ type: 'success', title: 'Arrived, seals intact', message: `${c.ref} delivered to ${c.to}.` });
        return undefined;
      }
      const incId = nextIncidentId(secIncidents);
      setIncidents((list) => [
        {
          id: incId,
          orgId: c.orgId,
          type: 'Breach of seal',
          site: `In transit — ${c.to} (consignment ${c.ref})`,
          occurredAt: arrived.arrival,
          reportedBy: c.escortGuards[0] ?? 'Receiving clerk',
          description: `Seals at loading ${c.sealsLoading.join(', ')}; at arrival ${seals.join(', ')}. Count the cargo and take statements from driver and escort.`,
          lossValue: 0,
          suspect: { kind: 'Unknown' },
          consignmentId: c.id,
          recovered: [],
          status: 'Open'
        },
        ...list
      ]);
      patchCon(id, () => ({ ...arrived, status: 'Incident', incidentId: incId }));
      addToast({ type: 'error', title: 'Seal mismatch — breach recorded', message: `Incident ${incId} opened for ${c.ref}. Hold the cargo until it is counted.` });
      return incId;
    },
    [consignments, secIncidents, nextIncidentId, addToast]
  );

  /* ---------------- guard operations */

  const addGuardShift = useCallback(
    (s: Omit<GuardShift, 'id' | 'orgId' | 'site'>) => setShifts((list) => [...list, { ...s, id: `GS-${String(list.length + 1).padStart(4, '0')}`, orgId: selectedOrgId, site: SITE[selectedOrgId] ?? '' }]),
    [selectedOrgId]
  );

  const addOccurrence = useCallback(
    (e: Omit<OccurrenceEntry, 'id' | 'orgId' | 'at' | 'site'>) =>
      setOb((list) => [{ ...e, id: `OB-${String(5000 + list.length)}`, orgId: selectedOrgId, at: nowStamp(), site: SITE[selectedOrgId] ?? '' }, ...list]),
    [selectedOrgId]
  );

  /* ---------------- incidents & investigations */

  const reportSecIncident = useCallback(
    (i: NewSecIncident) => {
      const id = nextIncidentId(secIncidents);
      setIncidents((list) => [{ ...i, id, orgId: selectedOrgId, recovered: [], status: 'Open' }, ...list]);
      addToast({ type: 'success', title: `Incident ${id} logged`, message: 'Assign an investigator to start the investigation.' });
      return id;
    },
    [secIncidents, nextIncidentId, selectedOrgId, addToast]
  );

  const startInvestigation = useCallback(
    (id: string, investigatorId: string) =>
      patchInc(id, (i) => ({ ...i, status: 'Under investigation', investigation: { investigatorId, openedOn: today, statements: [], evidence: [], cctvReviewed: false, findings: '' } })),
    [today]
  );

  const updateInvestigation = useCallback((id: string, patch: Partial<Pick<Investigation, 'cctvReviewed' | 'findings'>>) => patchInv(id, (v) => ({ ...v, ...patch })), []);
  const addStatement = useCallback((id: string, s: { by: string; summary: string }) => patchInv(id, (v) => ({ ...v, statements: [...v.statements, { ...s, on: today }] })), [today]);
  const addEvidence = useCallback((id: string, e: { item: string; ref: string }) => patchInv(id, (v) => ({ ...v, evidence: [...v.evidence, e] })), []);

  const closeInvestigation = useCallback(
    (id: string, outcome: InvestigationOutcome, obNumber?: string) => {
      patchInc(id, (i) => ({ ...i, status: 'Closed', investigation: i.investigation ? { ...i.investigation, outcome, obNumber: obNumber || i.investigation.obNumber, closedOn: today } : i.investigation }));
      addToast({ type: 'success', title: 'Investigation closed', message: `Outcome: ${outcome}${obNumber ? ` (${obNumber})` : ''}.` });
    },
    [today, addToast]
  );

  const setInsuranceClaim = useCallback((id: string, claim: InsuranceClaim) => patchInc(id, (i) => ({ ...i, claim })), []);

  const addRecovery = useCallback(
    (id: string, value: number, note: string) => {
      patchInc(id, (i) => ({ ...i, recovered: [...i.recovered, { on: today, value, note }] }));
      addToast({ type: 'success', title: 'Recovery recorded', message: `KES ${Math.round(value).toLocaleString()} recovered.` });
    },
    [today, addToast]
  );

  const linkDisciplinaryCase = useCallback(
    (id: string, caseId: string) =>
      patchInc(id, (i) => ({
        ...i,
        caseId,
        investigation: i.investigation ? { ...i.investigation, outcome: i.investigation.outcome ?? 'Disciplinary referral' } : i.investigation
      })),
    []
  );

  return useMemo(
    () => ({
      securityToday: today,
      gatePasses,
      raiseGatePass,
      decideGatePass,
      cancelGatePass,
      gateCheckOut,
      recordGateReturn,
      goodsReceipts,
      recordGoodsReceipt,
      visitors,
      registerVisitor,
      checkInVisitor,
      checkOutVisitor,
      consignments,
      requestEscort,
      decideEscort,
      assignEscort,
      dispatchConsignment,
      addCheckpoint,
      recordArrival,
      guardShifts,
      addGuardShift,
      patrolRounds,
      occurrences,
      addOccurrence,
      secIncidents,
      reportSecIncident,
      startInvestigation,
      updateInvestigation,
      addStatement,
      addEvidence,
      closeInvestigation,
      setInsuranceClaim,
      addRecovery,
      linkDisciplinaryCase,
      securitySystems
    }),
    [
      today,
      gatePasses,
      raiseGatePass,
      decideGatePass,
      cancelGatePass,
      gateCheckOut,
      recordGateReturn,
      goodsReceipts,
      recordGoodsReceipt,
      visitors,
      registerVisitor,
      checkInVisitor,
      checkOutVisitor,
      consignments,
      requestEscort,
      decideEscort,
      assignEscort,
      dispatchConsignment,
      addCheckpoint,
      recordArrival,
      guardShifts,
      addGuardShift,
      patrolRounds,
      occurrences,
      addOccurrence,
      secIncidents,
      reportSecIncident,
      startInvestigation,
      updateInvestigation,
      addStatement,
      addEvidence,
      closeInvestigation,
      setInsuranceClaim,
      addRecovery,
      linkDisciplinaryCase,
      securitySystems
    ]
  );
};
