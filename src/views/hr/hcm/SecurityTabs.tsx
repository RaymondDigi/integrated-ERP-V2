import React, { useState } from 'react';
import { ShieldCheck, Truck, Siren, Users, Eye, MessageSquareWarning, FileSearch } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { DataTable, Field, Modal, Panel, Stat, Timeline } from '../../../suites/ui/kit';
import { CLAIM_DOCUMENTS, PATROL_ROUTES, POLICY_LABEL, type Grievance, type GuardShift, type InsurancePolicy, type OccurrenceEntry, type SecurityInvestigation, type SecurityRequisition } from '../../../data/securityConfig';
import { fmt, kes, todayIso } from '../../../data/hcmEngine';
import { Btn, SimulatedBadge, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/* ================================================================ Security operations */

export const SecurityOpsTab: React.FC = () => {
  const { securityRequisitions, requestSecurity, decideSecurity, assignSecurity, completeSecurity, occurrences, addOccurrence, visitors, signInVisitor, signOutVisitor, guardRoster, addShift, patrols, startPatrol, checkPatrolPoint, endPatrol } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [rq, setRq] = useState({ type: 'ESCORT' as SecurityRequisition['type'], purpose: '', cargoRef: '', location: '', date: todayIso(), guards: 2 });
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [ob, setOb] = useState({ post: 'Main gate', category: 'Routine' as OccurrenceEntry['category'], entry: '' });
  const [vis, setVis] = useState({ name: '', idNo: '', company: '', hostStaffId: '', purpose: '', vehicle: '', badge: '' });
  const [shift, setShift] = useState({ date: todayIso(), shift: 'NIGHT' as GuardShift['shift'], post: 'Main gate', guard: '', provider: 'G4S Kenya Ltd' as GuardShift['provider'] });
  const [patrol, setPatrol] = useState({ guard: '', route: Object.keys(PATROL_ROUTES)[0] });
  const onSite = visitors.filter((v) => !v.outAt);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Security requests open" value={securityRequisitions.filter((r) => ['REQUESTED', 'APPROVED', 'ASSIGNED'].includes(r.status)).length} icon={<ShieldCheck size={16} />} />
        <Stat label="Visitors on site" value={onSite.length} icon={<Users size={16} />} tone="blue" />
        <Stat label="Guards rostered today" value={guardRoster.filter((g) => g.date === todayIso()).length} icon={<ShieldCheck size={16} />} tone="gold" />
        <Stat label="Patrols with missed points" value={patrols.filter((p) => p.status === 'MISSED_POINTS').length} icon={<Eye size={16} />} tone="red" />
      </div>
      <Panel title="Security requisitions" subtitle="Escorts, extra guards and cash-in-transit cover: requested, approved by the security manager, guards assigned, completed.">
        <div className="sx-grid">
          <Field label="Type">
            <select className="form-control" value={rq.type} onChange={(e) => setRq({ ...rq, type: e.target.value as SecurityRequisition['type'] })}>
              <option value="ESCORT">Cargo escort</option>
              <option value="GUARD">Extra guard</option>
              <option value="CASH_IN_TRANSIT">Cash in transit</option>
            </select>
          </Field>
          <Field label="Purpose" required span={2}>
            <input className="form-control" value={rq.purpose} onChange={(e) => setRq({ ...rq, purpose: e.target.value })} />
          </Field>
          <Field label="Cargo / reference">
            <input className="form-control" value={rq.cargoRef} onChange={(e) => setRq({ ...rq, cargoRef: e.target.value })} placeholder="Tea lot, invoice, stock transfer" />
          </Field>
          <Field label="Location" required>
            <input className="form-control" value={rq.location} onChange={(e) => setRq({ ...rq, location: e.target.value })} />
          </Field>
          <Field label="Date">
            <input className="form-control" type="date" value={rq.date} onChange={(e) => setRq({ ...rq, date: e.target.value })} />
          </Field>
          <Field label="Guards">
            <input className="form-control" type="number" value={rq.guards} onChange={(e) => setRq({ ...rq, guards: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => requestSecurity({ ...rq, cargoRef: rq.cargoRef || undefined }) && setRq({ ...rq, purpose: '' })}>
            Request security
          </Btn>
        </Toolbar>
        <DataTable
          rows={securityRequisitions}
          rowKey={(r) => r.id}
          columns={[
            { key: 'id', header: 'Request', render: (r) => `${r.id} · ${r.type.replace(/_/g, ' ').toLowerCase()}` },
            { key: 'p', header: 'Purpose', render: (r) => `${r.purpose}${r.cargoRef ? ` (${r.cargoRef})` : ''}` },
            { key: 'w', header: 'Where / when', render: (r) => `${r.location}, ${fmt(r.date)} · ${r.guards} guards` },
            { key: 'a', header: 'Assigned', render: (r) => r.assigned?.join(', ') ?? '—' },
            { key: 's', header: 'Status', render: (r) => <StatusPill status={r.status} /> },
            {
              key: 'x',
              header: '',
              render: (r) =>
                r.status === 'REQUESTED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Btn primary disabled={!canEdit} onClick={() => decideSecurity(r.id, true)}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideSecurity(r.id, false, 'No guards available on that date')}>
                      Decline
                    </Btn>
                  </span>
                ) : r.status === 'APPROVED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 180 }} placeholder="Guard names, comma separated" value={assign[r.id] ?? ''} onChange={(e) => setAssign({ ...assign, [r.id]: e.target.value })} />
                    <Btn disabled={!canEdit} onClick={() => assignSecurity(r.id, (assign[r.id] ?? '').split(',').map((s) => s.trim()).filter(Boolean))}>
                      Assign
                    </Btn>
                  </span>
                ) : r.status === 'ASSIGNED' ? (
                  <Btn disabled={!canEdit} onClick={() => completeSecurity(r.id)}>
                    Complete
                  </Btn>
                ) : null
            }
          ]}
        />
      </Panel>
      <Panel title="Occurrence book" subtitle="Append-only log kept at each post; entries cannot be edited or deleted.">
        <Toolbar>
          <input className="form-control" style={{ width: 140 }} value={ob.post} onChange={(e) => setOb({ ...ob, post: e.target.value })} aria-label="Post" />
          <select className="form-control" value={ob.category} onChange={(e) => setOb({ ...ob, category: e.target.value as OccurrenceEntry['category'] })} aria-label="Category">
            {(['Routine', 'Handover', 'Incident', 'Theft', 'Fire', 'Visitor', 'Alarm'] as const).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className="form-control" style={{ flex: 1, minWidth: 220 }} placeholder="Entry" value={ob.entry} onChange={(e) => setOb({ ...ob, entry: e.target.value })} />
          <Btn primary disabled={!canEdit} onClick={() => addOccurrence(ob) && setOb({ ...ob, entry: '' })}>
            Add entry
          </Btn>
        </Toolbar>
        <DataTable
          rows={occurrences}
          rowKey={(o) => o.id}
          columns={[
            { key: 'a', header: 'When', render: (o) => o.at },
            { key: 'p', header: 'Post', render: (o) => o.post },
            { key: 'c', header: 'Category', render: (o) => o.category },
            { key: 'e', header: 'Entry', render: (o) => o.entry },
            { key: 'b', header: 'By', render: (o) => o.by }
          ]}
        />
      </Panel>
      <Panel title="Visitor register">
        <div className="sx-grid">
          <Field label="Visitor" required>
            <input className="form-control" value={vis.name} onChange={(e) => setVis({ ...vis, name: e.target.value })} />
          </Field>
          <Field label="ID / passport no." required>
            <input className="form-control" value={vis.idNo} onChange={(e) => setVis({ ...vis, idNo: e.target.value })} />
          </Field>
          <Field label="Company">
            <input className="form-control" value={vis.company} onChange={(e) => setVis({ ...vis, company: e.target.value })} />
          </Field>
          <Field label="Host" required>
            <StaffSelect value={vis.hostStaffId} onChange={(v) => setVis({ ...vis, hostStaffId: v })} label="Host" />
          </Field>
          <Field label="Purpose">
            <input className="form-control" value={vis.purpose} onChange={(e) => setVis({ ...vis, purpose: e.target.value })} />
          </Field>
          <Field label="Vehicle">
            <input className="form-control" value={vis.vehicle} onChange={(e) => setVis({ ...vis, vehicle: e.target.value })} />
          </Field>
          <Field label="Badge no." required>
            <input className="form-control" value={vis.badge} onChange={(e) => setVis({ ...vis, badge: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => signInVisitor({ ...vis, vehicle: vis.vehicle || undefined }) && setVis({ ...vis, name: '', idNo: '', badge: '' })}>
            Sign in visitor
          </Btn>
        </Toolbar>
        <DataTable
          rows={visitors}
          rowKey={(v) => v.id}
          columns={[
            { key: 'n', header: 'Visitor', render: (v) => `${v.name} (${v.idNo}) — ${v.company}` },
            { key: 'h', header: 'Host / purpose', render: (v) => `${nameOf(v.hostStaffId)} · ${v.purpose}` },
            { key: 'b', header: 'Badge', render: (v) => v.badge },
            { key: 'i', header: 'In / out', render: (v) => `${v.inAt}${v.outAt ? ` → ${v.outAt}` : ''}` },
            {
              key: 'x',
              header: '',
              render: (v) =>
                v.outAt ? (
                  <StatusPill status="CLOSED" label="Left" />
                ) : (
                  <Btn disabled={!canEdit} onClick={() => signOutVisitor(v.id)}>
                    Sign out
                  </Btn>
                )
            }
          ]}
        />
      </Panel>
      <Panel title="Guard roster & patrols" subtitle="Deployment by post and shift (in-house and contracted), and patrol rounds with checkpoints scanned.">
        <Toolbar>
          <input className="form-control" style={{ width: 150 }} type="date" value={shift.date} onChange={(e) => setShift({ ...shift, date: e.target.value })} aria-label="Date" />
          <select className="form-control" value={shift.shift} onChange={(e) => setShift({ ...shift, shift: e.target.value as GuardShift['shift'] })} aria-label="Shift">
            <option value="DAY">Day</option>
            <option value="NIGHT">Night</option>
          </select>
          <input className="form-control" style={{ width: 140 }} value={shift.post} onChange={(e) => setShift({ ...shift, post: e.target.value })} aria-label="Post" />
          <input className="form-control" style={{ width: 160 }} placeholder="Guard" value={shift.guard} onChange={(e) => setShift({ ...shift, guard: e.target.value })} />
          <select className="form-control" value={shift.provider} onChange={(e) => setShift({ ...shift, provider: e.target.value as GuardShift['provider'] })} aria-label="Provider">
            <option>In-house</option>
            <option>G4S Kenya Ltd</option>
          </select>
          <Btn disabled={!canEdit} onClick={() => addShift(shift)}>
            Add shift
          </Btn>
        </Toolbar>
        <DataTable
          rows={guardRoster}
          rowKey={(g) => g.id}
          pageSize={8}
          columns={[
            { key: 'd', header: 'Date', render: (g) => `${fmt(g.date)} · ${g.shift}` },
            { key: 'p', header: 'Post', render: (g) => g.post },
            { key: 'g', header: 'Guard', render: (g) => `${g.guard} (${g.provider})` }
          ]}
        />
        <Toolbar>
          <input className="form-control" style={{ width: 160 }} placeholder="Guard" value={patrol.guard} onChange={(e) => setPatrol({ ...patrol, guard: e.target.value })} />
          <select className="form-control" value={patrol.route} onChange={(e) => setPatrol({ ...patrol, route: e.target.value })} aria-label="Route">
            {Object.keys(PATROL_ROUTES).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Btn disabled={!canEdit} onClick={() => startPatrol(patrol.guard, patrol.route)}>
            Start patrol
          </Btn>
        </Toolbar>
        <DataTable
          rows={patrols}
          rowKey={(p) => p.id}
          columns={[
            { key: 'g', header: 'Patrol', render: (p) => `${p.id} · ${p.guard} — ${p.route}, ${p.startedAt}` },
            {
              key: 'c',
              header: 'Checkpoints',
              render: (p) => (
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {p.checkpoints.map((c) =>
                    c.at ? (
                      <span key={c.name} className="sx-pill sx-pill-success">
                        <i />
                        {c.name} {c.at.slice(-5)}
                      </span>
                    ) : p.status === 'IN_PROGRESS' ? (
                      <Btn key={c.name} disabled={!canEdit} onClick={() => checkPatrolPoint(p.id, c.name)}>
                        Scan {c.name}
                      </Btn>
                    ) : (
                      <span key={c.name} className="sx-pill sx-pill-critical">
                        <i />
                        {c.name} missed
                      </span>
                    )
                  )}
                </span>
              )
            },
            { key: 's', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
            {
              key: 'x',
              header: '',
              render: (p) =>
                p.status === 'IN_PROGRESS' ? (
                  <Btn disabled={!canEdit} onClick={() => endPatrol(p.id)}>
                    End patrol
                  </Btn>
                ) : null
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Gate inspection and cargo in transit */

export const GateTransitTab: React.FC = () => {
  const { gatePasses, recordGatePass, releaseGatePass, transitRecords, dispatchTransit, logCheckpoint, recordArrival } = useApp();
  const { canEdit } = useCanEdit();
  const [g, setG] = useState({ direction: 'OUT' as 'IN' | 'OUT', vehicle: '', driver: '', docRef: '', description: '', qtyDoc: 0, qtyFound: 0 });
  const [release, setRelease] = useState<Record<string, string>>({});
  const [t, setT] = useState({ cargo: '', cargoRef: '', vehicle: '', driver: '', escort: '', sealNo: '', origin: 'Kericho factory', destination: 'Mombasa — Chai warehouse', packagesSent: 0 });
  const [cp, setCp] = useState<Record<string, { place: string; sealIntact: boolean }>>({});
  const [arr, setArr] = useState<Record<string, { sealNo: string; received: number }>>({});
  return (
    <>
      <div className="sx-stats">
        <Stat label="Held at the gate" value={gatePasses.filter((x) => x.status === 'HELD').length} detail="count does not match the document" icon={<ShieldCheck size={16} />} tone="red" />
        <Stat label="Cargo in transit" value={transitRecords.filter((x) => x.status === 'IN_TRANSIT').length} icon={<Truck size={16} />} tone="blue" />
        <Stat label="Transit discrepancies" value={transitRecords.filter((x) => x.status === 'DISCREPANCY').length} detail="investigation opened automatically" icon={<Truck size={16} />} tone="orange" />
      </div>
      <Panel title="Gate inspection log" subtitle="Every vehicle in or out is checked against its document (delivery note, gate pass, GRN). A mismatch holds the vehicle until security releases it with a note.">
        <div className="sx-grid">
          <Field label="Direction">
            <select className="form-control" value={g.direction} onChange={(e) => setG({ ...g, direction: e.target.value as 'IN' | 'OUT' })}>
              <option value="OUT">Outgoing</option>
              <option value="IN">Incoming</option>
            </select>
          </Field>
          <Field label="Vehicle" required>
            <input className="form-control" value={g.vehicle} onChange={(e) => setG({ ...g, vehicle: e.target.value })} />
          </Field>
          <Field label="Driver">
            <input className="form-control" value={g.driver} onChange={(e) => setG({ ...g, driver: e.target.value })} />
          </Field>
          <Field label="Document ref" required>
            <input className="form-control" value={g.docRef} onChange={(e) => setG({ ...g, docRef: e.target.value })} />
          </Field>
          <Field label="Goods" required>
            <input className="form-control" value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} />
          </Field>
          <Field label="Qty on document">
            <input className="form-control" type="number" value={g.qtyDoc} onChange={(e) => setG({ ...g, qtyDoc: Number(e.target.value) })} />
          </Field>
          <Field label="Qty found">
            <input className="form-control" type="number" value={g.qtyFound} onChange={(e) => setG({ ...g, qtyFound: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => recordGatePass({ direction: g.direction, vehicle: g.vehicle, driver: g.driver, docRef: g.docRef, items: [{ description: g.description, qtyDoc: g.qtyDoc, qtyFound: g.qtyFound }] }) && setG({ ...g, vehicle: '', docRef: '' })}>
            Record inspection
          </Btn>
        </Toolbar>
        <DataTable
          rows={gatePasses}
          rowKey={(x) => x.id}
          columns={[
            { key: 'id', header: 'Pass', render: (x) => `${x.id} · ${x.direction}` },
            { key: 'v', header: 'Vehicle / driver', render: (x) => `${x.vehicle} — ${x.driver}` },
            { key: 'd', header: 'Document', render: (x) => x.docRef },
            { key: 'i', header: 'Items (doc / found)', render: (x) => x.items.map((i) => `${i.description}: ${i.qtyDoc}/${i.qtyFound}`).join('; ') },
            { key: 'a', header: 'When', render: (x) => `${x.at} · ${x.guard}` },
            { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} /> },
            {
              key: 'x',
              header: '',
              render: (x) =>
                x.status === 'HELD' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 160 }} placeholder="Release note" value={release[x.id] ?? ''} onChange={(e) => setRelease({ ...release, [x.id]: e.target.value })} />
                    <Btn disabled={!canEdit} onClick={() => releaseGatePass(x.id, release[x.id] ?? '')}>
                      Release
                    </Btn>
                  </span>
                ) : (
                  <span className="muted">{x.note ?? ''}</span>
                )
            }
          ]}
        />
      </Panel>
      <Panel title="Cargo in transit" subtitle="Tea consignments to Mombasa and other sites: seal numbers, escort, checkpoints and arrival check. A broken seal or short count opens an investigation.">
        <div className="sx-grid">
          <Field label="Cargo" required>
            <input className="form-control" value={t.cargo} onChange={(e) => setT({ ...t, cargo: e.target.value })} placeholder="e.g. 640 bags BP1" />
          </Field>
          <Field label="Reference" required>
            <input className="form-control" value={t.cargoRef} onChange={(e) => setT({ ...t, cargoRef: e.target.value })} />
          </Field>
          <Field label="Vehicle" required>
            <input className="form-control" value={t.vehicle} onChange={(e) => setT({ ...t, vehicle: e.target.value })} />
          </Field>
          <Field label="Driver">
            <input className="form-control" value={t.driver} onChange={(e) => setT({ ...t, driver: e.target.value })} />
          </Field>
          <Field label="Escort">
            <input className="form-control" value={t.escort} onChange={(e) => setT({ ...t, escort: e.target.value })} />
          </Field>
          <Field label="Seal no." required>
            <input className="form-control" value={t.sealNo} onChange={(e) => setT({ ...t, sealNo: e.target.value })} />
          </Field>
          <Field label="Origin">
            <input className="form-control" value={t.origin} onChange={(e) => setT({ ...t, origin: e.target.value })} />
          </Field>
          <Field label="Destination">
            <input className="form-control" value={t.destination} onChange={(e) => setT({ ...t, destination: e.target.value })} />
          </Field>
          <Field label="Packages sent">
            <input className="form-control" type="number" value={t.packagesSent} onChange={(e) => setT({ ...t, packagesSent: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => dispatchTransit(t) && setT({ ...t, cargo: '', cargoRef: '', sealNo: '' })}>
            Dispatch
          </Btn>
        </Toolbar>
        <DataTable
          rows={transitRecords}
          rowKey={(x) => x.id}
          columns={[
            { key: 'c', header: 'Consignment', render: (x) => `${x.id} · ${x.cargo} (${x.cargoRef})` },
            { key: 'r', header: 'Route', render: (x) => `${x.origin} → ${x.destination}` },
            { key: 'v', header: 'Vehicle / seal', render: (x) => `${x.vehicle}, seal ${x.sealNo}${x.arrivalSealNo ? ` / arrived ${x.arrivalSealNo}` : ''}` },
            { key: 'k', header: 'Checkpoints', render: (x) => x.checkpoints.map((c) => `${c.place} ${c.at.slice(-5)}${c.sealIntact ? '' : ' (seal broken)'}`).join(' → ') || '—' },
            { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} label={x.status === 'DISCREPANCY' ? `Discrepancy${x.investigationId ? ` · ${x.investigationId}` : ''}` : undefined} /> },
            {
              key: 'x',
              header: '',
              render: (x) =>
                x.status === 'IN_TRANSIT' ? (
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input className="form-control" style={{ width: 110 }} placeholder="Checkpoint" value={cp[x.id]?.place ?? ''} onChange={(e) => setCp({ ...cp, [x.id]: { place: e.target.value, sealIntact: cp[x.id]?.sealIntact ?? true } })} />
                    <label style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={cp[x.id]?.sealIntact ?? true} onChange={(e) => setCp({ ...cp, [x.id]: { place: cp[x.id]?.place ?? '', sealIntact: e.target.checked } })} /> seal intact
                    </label>
                    <Btn disabled={!canEdit} onClick={() => logCheckpoint(x.id, cp[x.id] ?? { place: '', sealIntact: true })}>
                      Log
                    </Btn>
                    <input className="form-control" style={{ width: 100 }} placeholder="Seal on arrival" value={arr[x.id]?.sealNo ?? ''} onChange={(e) => setArr({ ...arr, [x.id]: { sealNo: e.target.value, received: arr[x.id]?.received ?? x.packagesSent } })} />
                    <input className="form-control" style={{ width: 70 }} type="number" value={arr[x.id]?.received ?? x.packagesSent} onChange={(e) => setArr({ ...arr, [x.id]: { sealNo: arr[x.id]?.sealNo ?? '', received: Number(e.target.value) } })} aria-label="Packages received" />
                    <Btn disabled={!canEdit} onClick={() => recordArrival(x.id, arr[x.id]?.sealNo ?? '', arr[x.id]?.received ?? x.packagesSent)}>
                      Arrived
                    </Btn>
                  </span>
                ) : (
                  <span className="muted">{x.discrepancy ?? (x.arrivedAt ? `Arrived ${x.arrivedAt}` : '')}</span>
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Investigations and insurance claims */

export const InvestigationsClaimsTab: React.FC = () => {
  const { investigations, openInvestigation, addEvidence, addInterview, recordFindings, closeInvestigation, insuranceClaims, raiseInsuranceClaim, lodgeClaimDocument, assessClaim, settleClaim, rejectClaim } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [inv, setInv] = useState({ subject: '', subjectStaffId: '', category: 'Theft' as SecurityInvestigation['category'], allegation: '', investigator: '' });
  const [sel, setSel] = useState<string | null>(null);
  const [ev, setEv] = useState('');
  const [iv, setIv] = useState({ person: '', summary: '' });
  const [fd, setFd] = useState({ findings: '', recommendation: 'NO_ACTION' as NonNullable<SecurityInvestigation['recommendation']>, valueKes: 0 });
  const [cl, setCl] = useState({ policy: 'PROPERTY' as InsurancePolicy, incidentRef: '', description: '', lossDate: todayIso(), amountClaimedKes: 0, excessKes: 0 });
  const [settle, setSettle] = useState<Record<string, number>>({});
  const cur = investigations.find((x) => x.id === sel);
  return (
    <>
      <Panel title="Security investigations" subtitle="Theft, fraud, losses in transit and unauthorised access: evidence, interviews, findings and the outcome (disciplinary case, insurance claim or police).">
        <div className="sx-grid">
          <Field label="Subject" required span={2}>
            <input className="form-control" value={inv.subject} onChange={(e) => setInv({ ...inv, subject: e.target.value })} />
          </Field>
          <Field label="Category">
            <select className="form-control" value={inv.category} onChange={(e) => setInv({ ...inv, category: e.target.value as SecurityInvestigation['category'] })}>
              {(['Theft', 'Fraud', 'Loss in transit', 'Unauthorised access', 'Damage'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Employee involved">
            <StaffSelect value={inv.subjectStaffId} onChange={(v) => setInv({ ...inv, subjectStaffId: v })} allowEmpty="None / unknown" />
          </Field>
          <Field label="Allegation" required span={2}>
            <input className="form-control" value={inv.allegation} onChange={(e) => setInv({ ...inv, allegation: e.target.value })} />
          </Field>
          <Field label="Investigator" required>
            <input className="form-control" value={inv.investigator} onChange={(e) => setInv({ ...inv, investigator: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => openInvestigation({ ...inv, subjectStaffId: inv.subjectStaffId || undefined }) && setInv({ ...inv, subject: '', allegation: '' })}>
            Open investigation
          </Btn>
        </Toolbar>
        <DataTable
          rows={investigations}
          rowKey={(x) => x.id}
          onRowClick={(x) => setSel(x.id)}
          columns={[
            { key: 'id', header: 'Case', render: (x) => `${x.id} · ${x.category}` },
            { key: 's', header: 'Subject', render: (x) => `${x.subject}${x.subjectStaffId ? ` — ${nameOf(x.subjectStaffId)}` : ''}` },
            { key: 'i', header: 'Investigator', render: (x) => x.investigator },
            { key: 'e', header: 'Evidence / interviews', render: (x) => `${x.evidence.length} / ${x.interviews.length}` },
            { key: 'st', header: 'Status', render: (x) => <StatusPill status={x.status} /> },
            { key: 'o', header: 'Outcome', render: (x) => (x.recommendation ? `${x.recommendation.replace(/_/g, ' ').toLowerCase()}${x.outcomeRef ? ` (${x.outcomeRef})` : ''}` : '—') }
          ]}
        />
      </Panel>
      {cur && (
        <Modal
          title={`${cur.id} — ${cur.subject}`}
          subtitle={cur.allegation}
          onClose={() => setSel(null)}
          footer={
            cur.status === 'FINDINGS' ? (
              <Btn primary disabled={!canEdit} onClick={() => closeInvestigation(cur.id) && setSel(null)}>
                Close and act on the recommendation
              </Btn>
            ) : undefined
          }
        >
          <h4>Evidence</h4>
          <ul>
            {cur.evidence.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          {cur.status === 'OPEN' && (
            <>
              <Toolbar>
                <input className="form-control" style={{ flex: 1 }} placeholder="CCTV clip, statement, stock count…" value={ev} onChange={(e) => setEv(e.target.value)} />
                <Btn disabled={!canEdit} onClick={() => addEvidence(cur.id, ev) && setEv('')}>
                  Add evidence
                </Btn>
              </Toolbar>
              <Toolbar>
                <input className="form-control" style={{ width: 160 }} placeholder="Person interviewed" value={iv.person} onChange={(e) => setIv({ ...iv, person: e.target.value })} />
                <input className="form-control" style={{ flex: 1 }} placeholder="Summary" value={iv.summary} onChange={(e) => setIv({ ...iv, summary: e.target.value })} />
                <Btn disabled={!canEdit} onClick={() => addInterview(cur.id, iv.person, iv.summary) && setIv({ person: '', summary: '' })}>
                  Add interview
                </Btn>
              </Toolbar>
            </>
          )}
          <h4>Interviews</h4>
          <ul>
            {cur.interviews.map((x, i) => (
              <li key={i}>
                {x.person} ({fmt(x.on)}): {x.summary}
              </li>
            ))}
          </ul>
          {cur.status === 'OPEN' && (
            <div className="sx-grid">
              <Field label="Findings" span={2}>
                <input className="form-control" value={fd.findings} onChange={(e) => setFd({ ...fd, findings: e.target.value })} />
              </Field>
              <Field label="Recommendation">
                <select className="form-control" value={fd.recommendation} onChange={(e) => setFd({ ...fd, recommendation: e.target.value as typeof fd.recommendation })}>
                  <option value="NO_ACTION">No action</option>
                  <option value="DISCIPLINARY">Disciplinary case</option>
                  <option value="INSURANCE_CLAIM">Insurance claim</option>
                  <option value="POLICE">Report to police</option>
                </select>
              </Field>
              <Field label="Value lost (KES)">
                <input className="form-control" type="number" value={fd.valueKes || ''} onChange={(e) => setFd({ ...fd, valueKes: Number(e.target.value) })} />
              </Field>
              <Btn disabled={!canEdit} onClick={() => recordFindings(cur.id, fd.findings, fd.recommendation, fd.valueKes || undefined)}>
                Record findings
              </Btn>
            </div>
          )}
          {cur.findings && <p>Findings: {cur.findings}</p>}
          <Timeline items={cur.history} />
        </Modal>
      )}
      <Panel title="Insurance claims" subtitle="Claims on company policies other than WIBA: notified, documents lodged, assessed by the insurer and settled or rejected.">
        <div className="sx-grid">
          <Field label="Policy">
            <select className="form-control" value={cl.policy} onChange={(e) => setCl({ ...cl, policy: e.target.value as InsurancePolicy })}>
              {Object.entries(POLICY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Incident / case ref" required>
            <input className="form-control" value={cl.incidentRef} onChange={(e) => setCl({ ...cl, incidentRef: e.target.value })} />
          </Field>
          <Field label="Description" required span={2}>
            <input className="form-control" value={cl.description} onChange={(e) => setCl({ ...cl, description: e.target.value })} />
          </Field>
          <Field label="Date of loss">
            <input className="form-control" type="date" value={cl.lossDate} onChange={(e) => setCl({ ...cl, lossDate: e.target.value })} />
          </Field>
          <Field label="Amount claimed (KES)">
            <input className="form-control" type="number" value={cl.amountClaimedKes || ''} onChange={(e) => setCl({ ...cl, amountClaimedKes: Number(e.target.value) })} />
          </Field>
          <Field label="Excess (KES)">
            <input className="form-control" type="number" value={cl.excessKes || ''} onChange={(e) => setCl({ ...cl, excessKes: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => raiseInsuranceClaim(cl) && setCl({ ...cl, incidentRef: '', description: '' })}>
            Notify insurer
          </Btn>
        </Toolbar>
        <DataTable
          rows={insuranceClaims}
          rowKey={(c) => c.id}
          columns={[
            { key: 'id', header: 'Claim', render: (c) => `${c.id} · ${POLICY_LABEL[c.policy]}` },
            { key: 'i', header: 'Insurer / incident', render: (c) => `${c.insurer} — ${c.incidentRef}` },
            { key: 'a', header: 'Claimed / settled', align: 'right', render: (c) => `${kes(c.amountClaimedKes)}${c.amountSettledKes !== undefined ? ` / ${kes(c.amountSettledKes)}` : ''}` },
            {
              key: 'd',
              header: 'Documents',
              render: (c) => (
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {CLAIM_DOCUMENTS[c.policy].map((doc) =>
                    c.documents.includes(doc) ? (
                      <span key={doc} className="sx-pill sx-pill-success">
                        <i />
                        {doc}
                      </span>
                    ) : (
                      <Btn key={doc} disabled={!canEdit || !['NOTIFIED', 'DOCUMENTED'].includes(c.status)} onClick={() => lodgeClaimDocument(c.id, doc)}>
                        + {doc}
                      </Btn>
                    )
                  )}
                </span>
              )
            },
            { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
            {
              key: 'x',
              header: '',
              render: (c) =>
                c.status === 'DOCUMENTED' ? (
                  <Btn disabled={!canEdit} onClick={() => assessClaim(c.id)}>
                    Insurer assessed
                  </Btn>
                ) : c.status === 'ASSESSED' ? (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <input className="form-control" style={{ width: 100 }} type="number" placeholder="Settled KES" value={settle[c.id] ?? ''} onChange={(e) => setSettle({ ...settle, [c.id]: Number(e.target.value) })} />
                    <Btn disabled={!canEdit} onClick={() => settleClaim(c.id, settle[c.id] ?? 0)}>
                      Settle
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => rejectClaim(c.id, 'Repudiated by the insurer')}>
                      Rejected
                    </Btn>
                  </span>
                ) : null
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Grievances, stakeholder complaints and whistleblowing */

export const GrievancesTab: React.FC = () => {
  const { grievances, whistleblowingCount, canSeeWhistleblowing, raiseGrievance, reportWhistleblowing, lookupWhistleblowing, followUpWhistleblowing, assignGrievance, scheduleGrievanceHearing, replyGrievance, resolveGrievance, appealGrievance, closeGrievance } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [g, setG] = useState({ channel: 'STAFF' as 'STAFF' | 'STAKEHOLDER', category: 'Grievance' as Grievance['category'], subject: '', details: '', staffId: '', complainant: '', contact: '', against: '', confidential: true });
  const [wb, setWb] = useState({ category: 'Fraud' as Grievance['category'], subject: '', details: '', against: '' });
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState('');
  const [follow, setFollow] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const cur = grievances.find((x) => x.id === sel);
  const found = lookup.trim() ? lookupWhistleblowing(lookup.trim()) : null;
  return (
    <>
      <div className="sx-stats">
        <Stat label="Open grievances" value={grievances.filter((x) => x.channel !== 'WHISTLEBLOWER' && !['RESOLVED', 'CLOSED'].includes(x.status)).length} icon={<MessageSquareWarning size={16} />} />
        <Stat label="Past response date" value={grievances.filter((x) => !['RESOLVED', 'CLOSED'].includes(x.status) && x.responseDue < todayIso()).length} icon={<MessageSquareWarning size={16} />} tone="red" />
        <Stat label="Whistleblowing reports" value={whistleblowingCount} detail={canSeeWhistleblowing ? 'you can see these cases' : 'restricted to designated officers'} icon={<Eye size={16} />} tone="violet" />
      </div>
      <Panel title="Raise a grievance or complaint" subtitle="Staff grievances and harassment complaints, and complaints from the community, suppliers and visitors. Confidential cases show the complainant only to the case officer.">
        <div className="sx-grid">
          <Field label="Channel">
            <select className="form-control" value={g.channel} onChange={(e) => setG({ ...g, channel: e.target.value as 'STAFF' | 'STAKEHOLDER', category: e.target.value === 'STAFF' ? 'Grievance' : 'Community' })}>
              <option value="STAFF">Staff grievance</option>
              <option value="STAKEHOLDER">Stakeholder complaint</option>
            </select>
          </Field>
          <Field label="Category">
            <select className="form-control" value={g.category} onChange={(e) => setG({ ...g, category: e.target.value as Grievance['category'] })}>
              {(g.channel === 'STAFF' ? ['Grievance', 'Harassment', 'Discrimination', 'Working conditions', 'Safety', 'Other'] : ['Community', 'Supplier', 'Safety', 'Other']).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          {g.channel === 'STAFF' ? (
            <Field label="Employee" required>
              <StaffSelect value={g.staffId} onChange={(v) => setG({ ...g, staffId: v })} />
            </Field>
          ) : (
            <>
              <Field label="Complainant" required>
                <input className="form-control" value={g.complainant} onChange={(e) => setG({ ...g, complainant: e.target.value })} />
              </Field>
              <Field label="Contact">
                <input className="form-control" value={g.contact} onChange={(e) => setG({ ...g, contact: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="About (person or unit)">
            <input className="form-control" value={g.against} onChange={(e) => setG({ ...g, against: e.target.value })} />
          </Field>
          <Field label="Subject" required span={2}>
            <input className="form-control" value={g.subject} onChange={(e) => setG({ ...g, subject: e.target.value })} />
          </Field>
          <Field label="Details" required span={2}>
            <textarea className="form-control" rows={2} value={g.details} onChange={(e) => setG({ ...g, details: e.target.value })} />
          </Field>
          <Field label="Confidential">
            <select className="form-control" value={g.confidential ? 'yes' : 'no'} onChange={(e) => setG({ ...g, confidential: e.target.value === 'yes' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => raiseGrievance({ ...g, staffId: g.staffId || undefined, complainant: g.complainant || undefined, contact: g.contact || undefined, against: g.against || undefined }) && setG({ ...g, subject: '', details: '' })}>
            Log complaint
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Anonymous whistleblowing" subtitle="Nothing that identifies the reporter is stored. The reporter keeps a tracking code to follow up; only designated officers (directors, internal audit, HR manager) see these cases.">
        <div className="sx-grid">
          <Field label="Category">
            <select className="form-control" value={wb.category} onChange={(e) => setWb({ ...wb, category: e.target.value as Grievance['category'] })}>
              {['Fraud', 'Corruption', 'Harassment', 'Safety', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="About (optional)">
            <input className="form-control" value={wb.against} onChange={(e) => setWb({ ...wb, against: e.target.value })} />
          </Field>
          <Field label="Subject" required span={2}>
            <input className="form-control" value={wb.subject} onChange={(e) => setWb({ ...wb, subject: e.target.value })} />
          </Field>
          <Field label="What happened" required span={4}>
            <textarea className="form-control" rows={2} value={wb.details} onChange={(e) => setWb({ ...wb, details: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn
            primary
            disabled={!canEdit}
            onClick={() => {
              const c = reportWhistleblowing({ ...wb, against: wb.against || undefined });
              if (c) {
                setCode(c);
                setWb({ ...wb, subject: '', details: '' });
              }
            }}
          >
            Submit anonymously
          </Btn>
          {code && (
            <span className="sx-pill sx-pill-info">
              <i />
              Your tracking code: <b data-testid="wb-code">{code}</b> — keep it to follow up
            </span>
          )}
        </Toolbar>
        <Toolbar>
          <input className="form-control" style={{ width: 200 }} placeholder="Tracking code" value={lookup} onChange={(e) => setLookup(e.target.value)} />
          {found ? (
            <>
              <span>
                Status: <StatusPill status={found.status} /> · response due {fmt(found.responseDue)} · {found.messages.length} messages
              </span>
              <input className="form-control" style={{ flex: 1 }} placeholder="Add information for the case officer" value={follow} onChange={(e) => setFollow(e.target.value)} />
              <Btn disabled={!canEdit} onClick={() => followUpWhistleblowing(lookup.trim(), follow) && setFollow('')}>
                Send
              </Btn>
            </>
          ) : (
            lookup.trim() && <span className="muted">No report with that code.</span>
          )}
        </Toolbar>
      </Panel>
      <Panel title="Cases">
        <DataTable
          rows={grievances}
          rowKey={(x) => x.id}
          onRowClick={(x) => setSel(x.id)}
          columns={[
            { key: 'id', header: 'Case', render: (x) => `${x.id} · ${x.channel === 'WHISTLEBLOWER' ? 'Whistleblowing' : x.channel === 'STAFF' ? 'Staff' : 'Stakeholder'}` },
            { key: 'c', header: 'Category', render: (x) => x.category },
            { key: 's', header: 'Subject', render: (x) => x.subject },
            { key: 'f', header: 'From', render: (x) => (x.channel === 'WHISTLEBLOWER' ? 'Anonymous' : x.confidential ? 'Confidential' : x.staffId ? nameOf(x.staffId) : x.complainant ?? '—') },
            { key: 'r', header: 'Response due', render: (x) => <span style={{ color: x.responseDue < todayIso() && !['RESOLVED', 'CLOSED'].includes(x.status) ? 'var(--status-critical)' : undefined }}>{fmt(x.responseDue)}</span> },
            { key: 'st', header: 'Status', render: (x) => <StatusPill status={x.status} /> }
          ]}
        />
      </Panel>
      {cur && (
        <Modal
          title={`${cur.id} — ${cur.subject}`}
          subtitle={`${cur.category} · ${cur.channel === 'WHISTLEBLOWER' ? 'anonymous report' : cur.confidential ? 'confidential' : cur.staffId ? nameOf(cur.staffId) : cur.complainant ?? ''}${cur.investigator ? ` · investigator ${cur.investigator}` : ''}`}
          onClose={() => setSel(null)}
        >
          <p>{cur.details}</p>
          {cur.against && <p>About: {cur.against}</p>}
          <ul>
            {cur.messages.map((m, i) => (
              <li key={i}>
                <b>{m.from === 'REPORTER' ? 'Reporter' : 'Case officer'}</b> ({m.at}): {m.text}
              </li>
            ))}
          </ul>
          {cur.resolution && <p>Resolution: {cur.resolution}</p>}
          {cur.appeal && <p>Appeal: {cur.appeal}</p>}
          <Toolbar>
            <input className="form-control" style={{ flex: 1, minWidth: 220 }} placeholder="Investigator / reply / resolution / appeal reason" value={text} onChange={(e) => setText(e.target.value)} />
            <input className="form-control" style={{ width: 150 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Hearing date" />
          </Toolbar>
          <Toolbar>
            {cur.status === 'RECEIVED' && (
              <Btn disabled={!canEdit} onClick={() => assignGrievance(cur.id, text) && setText('')}>
                Assign investigator
              </Btn>
            )}
            {['INVESTIGATING', 'APPEALED'].includes(cur.status) && (
              <Btn disabled={!canEdit} onClick={() => scheduleGrievanceHearing(cur.id, date)}>
                Schedule hearing
              </Btn>
            )}
            {!['CLOSED'].includes(cur.status) && (
              <Btn disabled={!canEdit} onClick={() => replyGrievance(cur.id, text) && setText('')}>
                Reply
              </Btn>
            )}
            {['INVESTIGATING', 'HEARING', 'APPEALED'].includes(cur.status) && (
              <Btn primary disabled={!canEdit} onClick={() => resolveGrievance(cur.id, text) && setText('')}>
                Resolve
              </Btn>
            )}
            {cur.status === 'RESOLVED' && (
              <>
                <Btn disabled={!canEdit} onClick={() => appealGrievance(cur.id, text) && setText('')}>
                  Record appeal
                </Btn>
                <Btn primary disabled={!canEdit} onClick={() => closeGrievance(cur.id) && setSel(null)}>
                  Close
                </Btn>
              </>
            )}
          </Toolbar>
        </Modal>
      )}
    </>
  );
};

/* ================================================================ CCTV, access control and alarms (simulated feed) */

export const AlarmsTab: React.FC = () => {
  const { alarms, simulateAlarm, acknowledgeAlarm, closeAlarm } = useApp();
  const { canEdit } = useCanEdit();
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <Panel
      title="CCTV, access control & alarm events"
      subtitle="Events from cameras, door controllers, the fire panel and perimeter sensors. No hardware is connected in this demo — the feed below is simulated."
      action={
        <Toolbar>
          <SimulatedBadge what="CCTV / access-control feed" />
          <Btn disabled={!canEdit} onClick={() => simulateAlarm()}>
            <Siren size={13} /> Simulate event
          </Btn>
        </Toolbar>
      }
    >
      <DataTable
        rows={alarms}
        rowKey={(a) => a.id}
        empty="No events."
        columns={[
          { key: 'a', header: 'When', render: (a) => a.at },
          { key: 's', header: 'Source', render: (a) => a.source.replace(/_/g, ' ').toLowerCase() },
          { key: 'l', header: 'Location', render: (a) => a.location },
          { key: 'm', header: 'Event', render: (a) => a.message },
          { key: 'v', header: 'Severity', render: (a) => <StatusPill status={a.severity === 'high' ? 'OVERDUE' : a.severity === 'medium' ? 'PENDING' : 'APPROVED'} label={a.severity} /> },
          { key: 'st', header: 'Status', render: (a) => <StatusPill status={a.status} label={a.status === 'ACKNOWLEDGED' ? `Acknowledged · ${a.ackBy}` : undefined} /> },
          {
            key: 'x',
            header: '',
            render: (a) =>
              a.status === 'NEW' ? (
                <Btn disabled={!canEdit} onClick={() => acknowledgeAlarm(a.id)}>
                  Acknowledge
                </Btn>
              ) : a.status === 'ACKNOWLEDGED' ? (
                <span style={{ display: 'flex', gap: 4 }}>
                  <input className="form-control" style={{ width: 160 }} placeholder="Outcome" value={note[a.id] ?? ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                  <Btn disabled={!canEdit} onClick={() => closeAlarm(a.id, note[a.id] ?? '')}>
                    Close
                  </Btn>
                </span>
              ) : (
                <span className="muted">{a.closedNote}</span>
              )
          }
        ]}
      />
    </Panel>
  );
};

export const SECURITY_TABS = [
  { id: 'security', label: 'Security operations', icon: ShieldCheck },
  { id: 'gate', label: 'Gate & transit', icon: Truck },
  { id: 'investigations', label: 'Investigations & claims', icon: FileSearch },
  { id: 'grievances', label: 'Grievances & whistleblowing', icon: MessageSquareWarning },
  { id: 'alarms', label: 'CCTV & alarms', icon: Siren }
];
