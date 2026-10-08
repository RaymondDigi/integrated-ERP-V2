import React, { useState } from 'react';
import { HeartHandshake, Stethoscope, Plane, Users, BookOpen, HardHat, CalendarHeart } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useFinance } from '../../../suites/finance/store';
import { DataTable, Field, Modal, Panel, Stat, Timeline } from '../../../suites/ui/kit';
import { MEDICAL_SCHEMES, PER_DIEM_RATES, PETTY_CASH_LIMIT_KES, LOAN_DAYS, MAX_LOANS, FINE_PER_DAY_KES, type ClaimBenefit, type CsrActivity, type HrEvent, type TravelRequest } from '../../../data/hcmConfig';
import { fmt, kes, limitOf, loanFine, nightsBetween, perDiemRate, schemeFor, todayIso, utilised } from '../../../data/hcmEngine';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/* ================================================================ Welfare */

export const WelfareTab: React.FC = () => {
  const { welfareSchemes, welfareClaims, submitWelfareClaim, decideWelfareClaim, payWelfareClaim } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [form, setForm] = useState({ staffId: '', schemeId: welfareSchemes[0]?.id ?? '', eventDate: todayIso(), details: '' });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const open = welfareClaims.filter((c) => c.status === 'SUBMITTED' || c.status === 'HR_APPROVED');
  return (
    <>
      <div className="sx-stats">
        <Stat label="Claims waiting" value={open.length} detail="HR approves, payroll pays" icon={<HeartHandshake size={16} />} tone="gold" />
        <Stat label="Paid this year" value={kes(welfareClaims.filter((c) => c.status === 'PAID').reduce((n, c) => n + c.amountKes, 0))} detail={`${welfareClaims.filter((c) => c.status === 'PAID').length} benefits`} icon={<HeartHandshake size={16} />} />
      </div>
      <Panel title="Welfare entitlements" subtitle="Eligibility (service and times per year) is checked when a claim is made; approved benefits are paid tax-free through payroll.">
        <DataTable
          rows={welfareSchemes}
          rowKey={(s) => s.id}
          columns={[
            { key: 'e', header: 'Event', render: (s) => s.event },
            { key: 'a', header: 'Benefit', align: 'right', render: (s) => kes(s.amountKes) },
            { key: 'm', header: 'Minimum service', render: (s) => `${s.minServiceMonths} months` },
            { key: 'y', header: 'Per year', render: (s) => s.maxPerYear },
            { key: 'd', header: 'Document', render: (s) => s.requiresDocument }
          ]}
        />
      </Panel>
      <Panel title="New welfare claim">
        <div className="sx-grid">
          <Field label="Employee" required>
            <StaffSelect value={form.staffId} onChange={(v) => setForm({ ...form, staffId: v })} />
          </Field>
          <Field label="Entitlement" required>
            <select className="form-control" value={form.schemeId} onChange={(e) => setForm({ ...form, schemeId: e.target.value })}>
              {welfareSchemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.event}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of the event" required>
            <input className="form-control" type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </Field>
          <Field label="Details" required>
            <input className="form-control" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Who, where, document reference" />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => submitWelfareClaim(form) && setForm({ ...form, details: '' })}>
            Submit claim
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Claims">
        <DataTable
          rows={welfareClaims}
          rowKey={(c) => c.id}
          columns={[
            { key: 'id', header: 'Claim', render: (c) => `${c.id} · ${fmt(c.submittedOn)}` },
            { key: 's', header: 'Employee', render: (c) => nameOf(c.staffId) },
            { key: 'e', header: 'Event', render: (c) => `${welfareSchemes.find((s) => s.id === c.schemeId)?.event ?? c.schemeId} — ${c.details}` },
            { key: 'a', header: 'Amount', align: 'right', render: (c) => kes(c.amountKes) },
            { key: 'st', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
            {
              key: 'x',
              header: 'Action',
              render: (c) =>
                c.status === 'SUBMITTED' ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input className="form-control" style={{ width: 140 }} placeholder="Note" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
                    <Btn primary disabled={!canEdit} onClick={() => decideWelfareClaim(c.id, true, notes[c.id])}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideWelfareClaim(c.id, false, notes[c.id])}>
                      Decline
                    </Btn>
                  </span>
                ) : c.status === 'HR_APPROVED' ? (
                  <Btn primary disabled={!canEdit} onClick={() => payWelfareClaim(c.id)}>
                    Pay through payroll
                  </Btn>
                ) : (
                  <span className="muted">{c.paidRef ?? '—'}</span>
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Medical cover */

export const MedicalCoverTab: React.FC = () => {
  const { medicalCovers, medicalClaims, enrolMedical, addDependant, submitMedicalClaim, decideMedicalClaim } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [enrol, setEnrol] = useState({ staffId: '', schemeId: 'MED-C', memberNo: '', start: todayIso() });
  const [dep, setDep] = useState({ staffId: '', name: '', relation: 'Child' as 'Spouse' | 'Child' | 'Parent', dob: '' });
  const [claim, setClaim] = useState({ staffId: '', beneficiary: '', benefit: 'OUTPATIENT' as ClaimBenefit, provider: '', date: todayIso(), amountKes: 0 });
  const [approved, setApproved] = useState<Record<string, number>>({});
  return (
    <>
      <Panel title="Medical schemes" subtitle="Category follows the job grade. Limits are per member per year; claims above the remaining limit are capped.">
        <DataTable
          rows={MEDICAL_SCHEMES}
          rowKey={(s) => s.id}
          columns={[
            { key: 'n', header: 'Scheme', render: (s) => `${s.name} (cat. ${s.category}) — ${s.insurer}` },
            { key: 'g', header: 'Grades', render: (s) => s.grades.join(', ') },
            { key: 'i', header: 'Inpatient', align: 'right', render: (s) => kes(s.inpatientLimit) },
            { key: 'o', header: 'Outpatient', align: 'right', render: (s) => kes(s.outpatientLimit) },
            { key: 'd', header: 'Dental / optical', align: 'right', render: (s) => `${kes(s.dentalLimit)} / ${kes(s.opticalLimit)}` },
            { key: 'm', header: 'Dependants', align: 'right', render: (s) => s.maxDependants }
          ]}
        />
      </Panel>
      <Panel title="Members">
        <div className="sx-grid">
          <Field label="Employee">
            <StaffSelect value={enrol.staffId} onChange={(v) => setEnrol({ ...enrol, staffId: v })} />
          </Field>
          <Field label="Scheme">
            <select className="form-control" value={enrol.schemeId} onChange={(e) => setEnrol({ ...enrol, schemeId: e.target.value })}>
              {MEDICAL_SCHEMES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.category})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Member number">
            <input className="form-control" value={enrol.memberNo} onChange={(e) => setEnrol({ ...enrol, memberNo: e.target.value })} />
          </Field>
          <Field label="Cover starts">
            <input className="form-control" type="date" value={enrol.start} onChange={(e) => setEnrol({ ...enrol, start: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => enrolMedical(enrol)}>
            Enrol member
          </Btn>
        </Toolbar>
        <DataTable
          rows={medicalCovers}
          rowKey={(c) => c.staffId}
          columns={[
            { key: 's', header: 'Member', render: (c) => `${nameOf(c.staffId)} · ${c.memberNo}` },
            { key: 'sc', header: 'Scheme', render: (c) => `${schemeFor(c)?.name} (${schemeFor(c)?.category})` },
            { key: 'd', header: 'Dependants', render: (c) => c.dependants.map((x) => `${x.name} (${x.relation})`).join(', ') || '—' },
            { key: 'u', header: 'Outpatient used', align: 'right', render: (c) => `${kes(utilised(medicalClaims, c.staffId, 'OUTPATIENT'))} of ${kes(limitOf(c.schemeId, 'OUTPATIENT'))}` },
            { key: 'i', header: 'Inpatient used', align: 'right', render: (c) => `${kes(utilised(medicalClaims, c.staffId, 'INPATIENT'))} of ${kes(limitOf(c.schemeId, 'INPATIENT'))}` }
          ]}
        />
        <div className="sx-grid" style={{ marginTop: 12 }}>
          <Field label="Add dependant to">
            <StaffSelect value={dep.staffId} onChange={(v) => setDep({ ...dep, staffId: v })} list={undefined} />
          </Field>
          <Field label="Name">
            <input className="form-control" value={dep.name} onChange={(e) => setDep({ ...dep, name: e.target.value })} />
          </Field>
          <Field label="Relation">
            <select className="form-control" value={dep.relation} onChange={(e) => setDep({ ...dep, relation: e.target.value as typeof dep.relation })}>
              <option>Spouse</option>
              <option>Child</option>
              <option>Parent</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input className="form-control" type="date" value={dep.dob} onChange={(e) => setDep({ ...dep, dob: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn disabled={!canEdit} onClick={() => addDependant(dep.staffId, { name: dep.name, relation: dep.relation, dob: dep.dob })}>
            Add dependant
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Claims & utilisation">
        <div className="sx-grid">
          <Field label="Member">
            <StaffSelect value={claim.staffId} onChange={(v) => setClaim({ ...claim, staffId: v, beneficiary: nameOf(v) })} />
          </Field>
          <Field label="Beneficiary">
            <input className="form-control" value={claim.beneficiary} onChange={(e) => setClaim({ ...claim, beneficiary: e.target.value })} />
          </Field>
          <Field label="Benefit">
            <select className="form-control" value={claim.benefit} onChange={(e) => setClaim({ ...claim, benefit: e.target.value as ClaimBenefit })}>
              {(['OUTPATIENT', 'INPATIENT', 'DENTAL', 'OPTICAL'] as const).map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Provider">
            <input className="form-control" value={claim.provider} onChange={(e) => setClaim({ ...claim, provider: e.target.value })} placeholder="e.g. Kericho County Referral" />
          </Field>
          <Field label="Date">
            <input className="form-control" type="date" value={claim.date} onChange={(e) => setClaim({ ...claim, date: e.target.value })} />
          </Field>
          <Field label="Amount (KES)">
            <input className="form-control" type="number" value={claim.amountKes || ''} onChange={(e) => setClaim({ ...claim, amountKes: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => submitMedicalClaim(claim)}>
            Submit claim
          </Btn>
        </Toolbar>
        <DataTable
          rows={medicalClaims}
          rowKey={(c) => c.id}
          columns={[
            { key: 'id', header: 'Claim', render: (c) => `${c.id} · ${fmt(c.date)}` },
            { key: 's', header: 'Member / beneficiary', render: (c) => `${nameOf(c.staffId)} / ${c.beneficiary}` },
            { key: 'b', header: 'Benefit', render: (c) => `${c.benefit} · ${c.provider}` },
            { key: 'a', header: 'Claimed', align: 'right', render: (c) => kes(c.amountKes) },
            { key: 'p', header: 'Approved', align: 'right', render: (c) => (c.approvedKes !== undefined ? kes(c.approvedKes) : '—') },
            { key: 'st', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
            {
              key: 'x',
              header: 'Decision',
              render: (c) =>
                c.status === 'SUBMITTED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 100 }} type="number" placeholder="Approve KES" value={approved[c.id] ?? ''} onChange={(e) => setApproved({ ...approved, [c.id]: Number(e.target.value) })} />
                    <Btn primary disabled={!canEdit} onClick={() => decideMedicalClaim(c.id, true, approved[c.id] || undefined)}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideMedicalClaim(c.id, false, undefined, 'Not covered under the scheme rules')}>
                      Decline
                    </Btn>
                  </span>
                ) : (
                  <span className="muted">{c.decidedBy ? `${c.decidedBy}${c.note ? ` — ${c.note}` : ''}` : '—'}</span>
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Travel, imprest and petty cash */

export const TravelTab: React.FC = () => {
  const { travelRequests, submitTravel, decideTravel, surrenderTravel, addToast } = useApp();
  const finance = useFinance();
  const { byId } = useStaff();
  const { canEdit, name } = useCanEdit();
  const [form, setForm] = useState({ staffId: '', kind: 'TRAVEL' as TravelRequest['kind'], purpose: '', destination: 'Mombasa', from: todayIso(), to: todayIso(), transportKes: 0, otherKes: 0 });
  const [sel, setSel] = useState<TravelRequest | null>(null);
  const [note, setNote] = useState('');
  const [spent, setSpent] = useState({ spentKes: 0, receipts: 0 });
  const e = byId(form.staffId);
  const rate = form.kind === 'TRAVEL' ? perDiemRate(form.destination, e).rate : 0;
  const nights = form.kind === 'TRAVEL' ? nightsBetween(form.from, form.to) : 0;
  const estimate = rate * nights + form.transportKes + form.otherKes;
  // Finance issues the money: the imprest journal is raised and submitted first, then the request is marked issued
  const issue = (t: TravelRequest) => {
    if (t.managerBy === name) {
      decideTravel(t.id, true);
      return;
    }
    const res = finance.saveJournal({
      date: todayIso(),
      memo: `${t.kind === 'TRAVEL' ? 'Travel imprest' : 'Petty cash'} ${t.id} — ${t.requestedBy}: ${t.purpose}`,
      lines: [
        { id: 'l1', account: '1300', description: `Staff imprest ${t.id} (${t.requestedBy})`, debit: t.totalKes, credit: 0, department: 'Administration' },
        { id: 'l2', account: '1000', description: `Paid to ${t.requestedBy}`, debit: 0, credit: t.totalKes }
      ]
    });
    if (!res.ok) {
      addToast({ type: 'error', title: 'Imprest not raised in Finance', message: res.error });
      return;
    }
    finance.transition('journals', res.id ?? '', 'submit');
    const jv = finance.snapshot().journals.find((j) => j.id === res.id)?.number ?? res.id ?? '';
    if (decideTravel(t.id, true, note, `Journal ${jv}`)) setSel(null);
  };
  return (
    <>
      <div className="sx-stats">
        <Stat label="Waiting for manager" value={travelRequests.filter((t) => t.status === 'SUBMITTED').length} icon={<Plane size={16} />} tone="gold" />
        <Stat label="Waiting for Finance" value={travelRequests.filter((t) => t.status === 'MANAGER_APPROVED').length} icon={<Plane size={16} />} tone="blue" />
        <Stat label="Imprest outstanding" value={kes(travelRequests.filter((t) => t.status === 'ISSUED').reduce((n, t) => n + t.totalKes, 0))} detail="to be surrendered" icon={<Plane size={16} />} tone="orange" />
      </div>
      <Panel title="New travel or petty cash request" subtitle={`Per diem follows the destination band and grade. Petty cash is capped at ${kes(PETTY_CASH_LIMIT_KES)}.`}>
        <div className="sx-grid">
          <Field label="Employee" required>
            <StaffSelect value={form.staffId} onChange={(v) => setForm({ ...form, staffId: v })} />
          </Field>
          <Field label="Type">
            <select className="form-control" value={form.kind} onChange={(ev) => setForm({ ...form, kind: ev.target.value as TravelRequest['kind'] })}>
              <option value="TRAVEL">Travel & imprest</option>
              <option value="PETTY_CASH">Petty cash</option>
            </select>
          </Field>
          <Field label="Purpose" required span={2}>
            <input className="form-control" value={form.purpose} onChange={(ev) => setForm({ ...form, purpose: ev.target.value })} />
          </Field>
          <Field label="Destination">
            <select className="form-control" value={form.destination} onChange={(ev) => setForm({ ...form, destination: ev.target.value })}>
              {PER_DIEM_RATES.flatMap((b) => b.destinations).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input className="form-control" type="date" value={form.from} onChange={(ev) => setForm({ ...form, from: ev.target.value })} />
          </Field>
          <Field label="To">
            <input className="form-control" type="date" value={form.to} onChange={(ev) => setForm({ ...form, to: ev.target.value })} />
          </Field>
          <Field label="Transport (KES)">
            <input className="form-control" type="number" value={form.transportKes || ''} onChange={(ev) => setForm({ ...form, transportKes: Number(ev.target.value) })} />
          </Field>
          <Field label="Other costs (KES)">
            <input className="form-control" type="number" value={form.otherKes || ''} onChange={(ev) => setForm({ ...form, otherKes: Number(ev.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <span className="muted">
            {form.kind === 'TRAVEL' ? `${nights} nights × ${kes(rate)} per diem + transport and other = ` : 'Petty cash: '}
            <b>{kes(estimate)}</b>
          </span>
          <Btn primary disabled={!canEdit} onClick={() => submitTravel(form) && setForm({ ...form, purpose: '' })}>
            Submit request
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Requests" subtitle="Line manager approves, Finance issues the money (journal), the traveller surrenders receipts; overspend is reimbursed through payroll.">
        <DataTable
          rows={travelRequests}
          rowKey={(t) => t.id}
          onRowClick={(t) => {
            setSel(t);
            setNote('');
            setSpent({ spentKes: t.totalKes, receipts: 1 });
          }}
          columns={[
            { key: 'id', header: 'Request', render: (t) => `${t.id} · ${t.kind === 'TRAVEL' ? 'Travel' : 'Petty cash'}` },
            { key: 'w', header: 'Who / where', render: (t) => `${t.requestedBy} — ${t.destination}, ${fmt(t.from)}${t.to !== t.from ? ` to ${fmt(t.to)}` : ''}` },
            { key: 'p', header: 'Purpose', render: (t) => t.purpose },
            { key: 'a', header: 'Amount', align: 'right', render: (t) => kes(t.totalKes) },
            { key: 's', header: 'Status', render: (t) => <StatusPill status={t.status} /> }
          ]}
        />
      </Panel>
      {sel && (
        <Modal
          title={`${sel.id} — ${sel.requestedBy}`}
          subtitle={`${sel.purpose} · ${kes(sel.totalKes)}`}
          onClose={() => setSel(null)}
          footer={
            <>
              {(sel.status === 'SUBMITTED' || sel.status === 'MANAGER_APPROVED') && (
                <>
                  <input className="form-control" style={{ maxWidth: 260 }} placeholder="Note (required to decline)" value={note} onChange={(ev) => setNote(ev.target.value)} />
                  <Btn disabled={!canEdit} onClick={() => decideTravel(sel.id, false, note) && setSel(null)}>
                    Decline
                  </Btn>
                  {sel.status === 'SUBMITTED' ? (
                    <Btn primary disabled={!canEdit} onClick={() => decideTravel(sel.id, true, note) && setSel(null)}>
                      Approve as manager
                    </Btn>
                  ) : (
                    <Btn primary disabled={!canEdit} onClick={() => issue(sel)}>
                      Issue money (Finance)
                    </Btn>
                  )}
                </>
              )}
              {sel.status === 'ISSUED' && (
                <>
                  <input className="form-control" style={{ width: 120 }} type="number" value={spent.spentKes} onChange={(ev) => setSpent({ ...spent, spentKes: Number(ev.target.value) })} aria-label="Spent" />
                  <input className="form-control" style={{ width: 80 }} type="number" value={spent.receipts} onChange={(ev) => setSpent({ ...spent, receipts: Number(ev.target.value) })} aria-label="Receipts" />
                  <Btn primary disabled={!canEdit} onClick={() => surrenderTravel(sel.id, spent.spentKes, spent.receipts) && setSel(null)}>
                    Record surrender
                  </Btn>
                </>
              )}
            </>
          }
        >
          <p>
            Per diem {kes(sel.perDiemRate)} × {sel.nights} = {kes(sel.perDiemKes)}; transport {kes(sel.transportKes)}; other {kes(sel.otherKes)}.
          </p>
          {sel.issueRef && <p>Finance: {sel.issueRef}</p>}
          {sel.surrender && (
            <p>
              Surrendered {fmt(sel.surrender.on)}: spent {kes(sel.surrender.spentKes)}, {sel.surrender.receipts} receipts, balance {kes(sel.surrender.balanceKes)}
              {sel.surrender.payrollTopUp ? ' (reimbursed through payroll)' : ''}.
            </p>
          )}
          <Timeline items={sel.history} />
        </Modal>
      )}
    </>
  );
};

/* ================================================================ CSR and events */

export const CsrEventsTab: React.FC = () => {
  const { csrActivities, saveCsr, decideCsr, completeCsr, hrEvents, saveEvent, submitEvent, decideEvent, toggleEventTask, closeEvent } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [csr, setCsr] = useState({ title: '', category: 'Education' as CsrActivity['category'], community: '', date: todayIso(), budgetKes: 0, beneficiaries: 0 });
  const [ev, setEv] = useState({ title: '', type: 'Team building' as HrEvent['type'], date: todayIso(), venue: '', budgetKes: 0, tasks: '' });
  const [result, setResult] = useState<Record<string, { actualKes: number; volunteerHours: number; beneficiaries: number; outcome: string }>>({});
  const [actual, setActual] = useState<Record<string, number>>({});
  return (
    <>
      <Panel title="CSR activities" subtitle="Plan, approve and report community projects — budget against actual, volunteer hours and beneficiaries.">
        <div className="sx-grid">
          <Field label="Activity" required span={2}>
            <input className="form-control" value={csr.title} onChange={(e) => setCsr({ ...csr, title: e.target.value })} />
          </Field>
          <Field label="Category">
            <select className="form-control" value={csr.category} onChange={(e) => setCsr({ ...csr, category: e.target.value as CsrActivity['category'] })}>
              {(['Education', 'Health', 'Environment', 'Water & sanitation', 'Community'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Community">
            <input className="form-control" value={csr.community} onChange={(e) => setCsr({ ...csr, community: e.target.value })} />
          </Field>
          <Field label="Date">
            <input className="form-control" type="date" value={csr.date} onChange={(e) => setCsr({ ...csr, date: e.target.value })} />
          </Field>
          <Field label="Budget (KES)">
            <input className="form-control" type="number" value={csr.budgetKes || ''} onChange={(e) => setCsr({ ...csr, budgetKes: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => saveCsr({ ...csr, volunteers: [] }) && setCsr({ ...csr, title: '' })}>
            Propose activity
          </Btn>
        </Toolbar>
        <DataTable
          rows={csrActivities}
          rowKey={(c) => c.id}
          columns={[
            { key: 't', header: 'Activity', render: (c) => `${c.id} · ${c.title}` },
            { key: 'c', header: 'Category / community', render: (c) => `${c.category} — ${c.community}` },
            { key: 'd', header: 'Date', render: (c) => fmt(c.date) },
            { key: 'b', header: 'Budget / actual', align: 'right', render: (c) => `${kes(c.budgetKes)}${c.actualKes !== undefined ? ` / ${kes(c.actualKes)}` : ''}` },
            { key: 'r', header: 'Reach', render: (c) => (c.status === 'DONE' ? `${c.beneficiaries} beneficiaries, ${c.volunteerHours} volunteer h` : `${c.volunteers.length} volunteers`) },
            { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
            {
              key: 'x',
              header: 'Action',
              render: (c) =>
                c.status === 'PLANNED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Btn primary disabled={!canEdit} onClick={() => decideCsr(c.id, true)}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideCsr(c.id, false, 'Not in this year’s CSR plan')}>
                      Decline
                    </Btn>
                  </span>
                ) : c.status === 'APPROVED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 90 }} type="number" placeholder="Spent" onChange={(e) => setResult({ ...result, [c.id]: { ...(result[c.id] ?? { volunteerHours: 0, beneficiaries: 0, outcome: 'Completed as planned' }), actualKes: Number(e.target.value) } })} />
                    <input className="form-control" style={{ width: 80 }} type="number" placeholder="Hours" onChange={(e) => setResult({ ...result, [c.id]: { ...(result[c.id] ?? { actualKes: 0, beneficiaries: 0, outcome: 'Completed as planned' }), volunteerHours: Number(e.target.value) } })} />
                    <input className="form-control" style={{ width: 90 }} type="number" placeholder="Reached" onChange={(e) => setResult({ ...result, [c.id]: { ...(result[c.id] ?? { actualKes: 0, volunteerHours: 0, outcome: 'Completed as planned' }), beneficiaries: Number(e.target.value) } })} />
                    <Btn disabled={!canEdit} onClick={() => completeCsr(c.id, result[c.id] ?? { actualKes: 0, volunteerHours: 0, beneficiaries: 0, outcome: '' })}>
                      Report done
                    </Btn>
                  </span>
                ) : (
                  <span className="muted">{c.outcome ?? '—'}</span>
                )
            }
          ]}
        />
      </Panel>
      <Panel title="Staff events" subtitle="Budget, venue, invitees, task list and approval before the event; actual spend recorded after.">
        <div className="sx-grid">
          <Field label="Event" required span={2}>
            <input className="form-control" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} />
          </Field>
          <Field label="Type">
            <select className="form-control" value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value as HrEvent['type'] })}>
              {(['Team building', 'Sports day', 'Long-service awards', 'Staff party', 'Health day', 'Town hall'] as const).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className="form-control" type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} />
          </Field>
          <Field label="Venue">
            <input className="form-control" value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} />
          </Field>
          <Field label="Budget (KES)">
            <input className="form-control" type="number" value={ev.budgetKes || ''} onChange={(e) => setEv({ ...ev, budgetKes: Number(e.target.value) })} />
          </Field>
          <Field label="Tasks (one per line)" span={2}>
            <textarea className="form-control" rows={2} value={ev.tasks} onChange={(e) => setEv({ ...ev, tasks: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn
            primary
            disabled={!canEdit}
            onClick={() =>
              saveEvent({ title: ev.title, type: ev.type, date: ev.date, venue: ev.venue, budgetKes: ev.budgetKes, invitees: [], tasks: ev.tasks.split('\n').filter((t) => t.trim()).map((t) => ({ task: t.trim(), owner: 'HR office', done: false })) }) &&
              setEv({ ...ev, title: '', tasks: '' })
            }
          >
            Save draft
          </Btn>
        </Toolbar>
        <DataTable
          rows={hrEvents}
          rowKey={(x) => x.id}
          columns={[
            { key: 't', header: 'Event', render: (x) => `${x.id} · ${x.title} (${x.type})` },
            { key: 'd', header: 'Date & venue', render: (x) => `${fmt(x.date)} — ${x.venue}` },
            { key: 'b', header: 'Budget / actual', align: 'right', render: (x) => `${kes(x.budgetKes)}${x.actualKes !== undefined ? ` / ${kes(x.actualKes)}` : ''}` },
            {
              key: 'k',
              header: 'Tasks',
              render: (x) => (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {x.tasks.map((t, i) => (
                    <label key={i} style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={t.done} disabled={!canEdit} onChange={() => toggleEventTask(x.id, i)} /> {t.task} ({t.owner})
                    </label>
                  ))}
                </span>
              )
            },
            { key: 'r', header: 'RSVP', render: (x) => `${Object.values(x.rsvp).filter((v) => v === 'YES').length} yes of ${x.invitees.length}` },
            { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} label={x.status === 'HELD' ? 'Held' : undefined} /> },
            {
              key: 'x',
              header: 'Action',
              render: (x) =>
                x.status === 'DRAFT' ? (
                  <Btn disabled={!canEdit} onClick={() => submitEvent(x.id)}>
                    Submit
                  </Btn>
                ) : x.status === 'SUBMITTED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Btn primary disabled={!canEdit} onClick={() => decideEvent(x.id, true)}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideEvent(x.id, false, 'Budget not available')}>
                      Decline
                    </Btn>
                  </span>
                ) : x.status === 'APPROVED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 100 }} type="number" placeholder="Actual KES" onChange={(e) => setActual({ ...actual, [x.id]: Number(e.target.value) })} />
                    <Btn disabled={!canEdit} onClick={() => closeEvent(x.id, actual[x.id] ?? 0)}>
                      Close
                    </Btn>
                  </span>
                ) : (
                  <span className="muted">{x.approvedBy ? `Approved by ${x.approvedBy}` : '—'}</span>
                )
            }
          ]}
        />
        <p className="muted">Organisers: {[...new Set(hrEvents.map((x) => x.organiser))].map((o) => nameOf(o)).join(', ')}. Invitees answer in the employee portal.</p>
      </Panel>
    </>
  );
};

/* ================================================================ Outsourced labour */

export const OutsourcedTab: React.FC = () => {
  const { outsourcedContracts, saveOutsourced, recordHeadcount, renewOutsourced, terminateOutsourced } = useApp();
  const { canEdit } = useCanEdit();
  const [f, setF] = useState({ contractor: '', service: '', contractNo: '', site: '', start: todayIso(), end: '', rateKes: 0, rateBasis: 'PER_HEAD_MONTH' as 'PER_HEAD_MONTH' | 'PER_MANDAY' });
  const [hc, setHc] = useState<Record<string, { month: string; planned: number; actual: number; days: number }>>({});
  const month = todayIso().slice(0, 7);
  const cost = (c: (typeof outsourcedContracts)[number], h: { actual: number; days?: number }) => (c.rateBasis === 'PER_MANDAY' ? c.rateKes * (h.days ?? 0) : c.rateKes * h.actual);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Active contracts" value={outsourcedContracts.filter((c) => c.status === 'ACTIVE').length} icon={<HardHat size={16} />} />
        <Stat
          label={`Engaged in ${month}`}
          value={outsourcedContracts.reduce((n, c) => n + (c.headcount.find((h) => h.month === month)?.actual ?? 0), 0)}
          detail="contract workers on site"
          icon={<Users size={16} />}
          tone="blue"
        />
        <Stat label="Ending in 60 days" value={outsourcedContracts.filter((c) => c.status === 'ACTIVE' && c.end <= new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)).length} icon={<HardHat size={16} />} tone="orange" />
      </div>
      <Panel title="Labour contractors" subtitle="Contract dates, rates and the number of workers engaged each month (planned against actual).">
        <div className="sx-grid">
          <Field label="Contractor" required>
            <input className="form-control" value={f.contractor} onChange={(e) => setF({ ...f, contractor: e.target.value })} />
          </Field>
          <Field label="Service" required>
            <input className="form-control" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="Plucking, security, cleaning…" />
          </Field>
          <Field label="Contract no.">
            <input className="form-control" value={f.contractNo} onChange={(e) => setF({ ...f, contractNo: e.target.value })} />
          </Field>
          <Field label="Site">
            <input className="form-control" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} />
          </Field>
          <Field label="Start">
            <input className="form-control" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="End">
            <input className="form-control" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </Field>
          <Field label="Rate (KES)">
            <input className="form-control" type="number" value={f.rateKes || ''} onChange={(e) => setF({ ...f, rateKes: Number(e.target.value) })} />
          </Field>
          <Field label="Rate basis">
            <select className="form-control" value={f.rateBasis} onChange={(e) => setF({ ...f, rateBasis: e.target.value as typeof f.rateBasis })}>
              <option value="PER_HEAD_MONTH">Per head per month</option>
              <option value="PER_MANDAY">Per man-day</option>
            </select>
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => saveOutsourced(f) && setF({ ...f, contractor: '', contractNo: '' })}>
            Add contract
          </Btn>
        </Toolbar>
        <DataTable
          rows={outsourcedContracts}
          rowKey={(c) => c.id}
          columns={[
            { key: 'c', header: 'Contractor', render: (c) => `${c.contractor} · ${c.contractNo}` },
            { key: 's', header: 'Service / site', render: (c) => `${c.service} — ${c.site}` },
            { key: 'p', header: 'Period', render: (c) => `${fmt(c.start)} to ${fmt(c.end)}` },
            { key: 'r', header: 'Rate', align: 'right', render: (c) => `${kes(c.rateKes)} ${c.rateBasis === 'PER_MANDAY' ? '/ man-day' : '/ head / month'}` },
            {
              key: 'h',
              header: 'Headcount by month',
              render: (c) =>
                c.headcount
                  .slice(-3)
                  .map((h) => `${h.month}: ${h.actual}/${h.planned}${h.days ? ` (${h.days} days)` : ''} · ${kes(cost(c, h))}`)
                  .join(' | ') || '—'
            },
            { key: 'st', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
            {
              key: 'x',
              header: 'Record month',
              render: (c) =>
                c.status === 'ACTIVE' ? (
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <input className="form-control" style={{ width: 90 }} defaultValue={month} onChange={(e) => setHc({ ...hc, [c.id]: { ...(hc[c.id] ?? { planned: 0, actual: 0, days: 0 }), month: e.target.value } })} aria-label="Month" />
                    <input className="form-control" style={{ width: 70 }} type="number" placeholder="Plan" onChange={(e) => setHc({ ...hc, [c.id]: { ...(hc[c.id] ?? { month, actual: 0, days: 0 }), planned: Number(e.target.value) } })} />
                    <input className="form-control" style={{ width: 70 }} type="number" placeholder="Actual" onChange={(e) => setHc({ ...hc, [c.id]: { ...(hc[c.id] ?? { month, planned: 0, days: 0 }), actual: Number(e.target.value) } })} />
                    {c.rateBasis === 'PER_MANDAY' && <input className="form-control" style={{ width: 70 }} type="number" placeholder="Days" onChange={(e) => setHc({ ...hc, [c.id]: { ...(hc[c.id] ?? { month, planned: 0, actual: 0 }), days: Number(e.target.value) } })} />}
                    <Btn disabled={!canEdit} onClick={() => { const h = hc[c.id] ?? { month, planned: 0, actual: 0, days: 0 }; recordHeadcount(c.id, h.month || month, h.planned, h.actual, h.days || undefined); }}>
                      Save
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => renewOutsourced(c.id, new Date(new Date(c.end).getTime() + 365 * 864e5).toISOString().slice(0, 10))}>
                      Renew 1 yr
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => terminateOutsourced(c.id, 'Terminated by HR')}>
                      End
                    </Btn>
                  </span>
                ) : (
                  '—'
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ Library */

export const LibraryTab: React.FC = () => {
  const { libraryBooks, libraryLoans, addBook, lendBook, returnBook, renewLoan } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [b, setB] = useState({ title: '', author: '', isbn: '', category: 'Tea & agronomy', copies: 1 });
  const [lend, setLend] = useState({ bookId: '', staffId: '' });
  const out = (id: string) => libraryLoans.filter((l) => l.bookId === id && !l.returned).length;
  const openLoans = libraryLoans.filter((l) => !l.returned);
  const overdue = openLoans.filter((l) => l.due < todayIso());
  return (
    <>
      <div className="sx-stats">
        <Stat label="Titles" value={libraryBooks.length} detail={`${libraryBooks.reduce((n, x) => n + x.copies, 0)} copies`} icon={<BookOpen size={16} />} />
        <Stat label="On loan" value={openLoans.length} detail={`${LOAN_DAYS}-day loans, up to ${MAX_LOANS} per person`} icon={<BookOpen size={16} />} tone="blue" />
        <Stat label="Overdue" value={overdue.length} detail={`fine ${kes(FINE_PER_DAY_KES)} a day`} icon={<BookOpen size={16} />} tone="red" />
      </div>
      <Panel title="Catalogue">
        <div className="sx-grid">
          <Field label="Title" required span={2}>
            <input className="form-control" value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} />
          </Field>
          <Field label="Author">
            <input className="form-control" value={b.author} onChange={(e) => setB({ ...b, author: e.target.value })} />
          </Field>
          <Field label="ISBN">
            <input className="form-control" value={b.isbn} onChange={(e) => setB({ ...b, isbn: e.target.value })} />
          </Field>
          <Field label="Category">
            <input className="form-control" value={b.category} onChange={(e) => setB({ ...b, category: e.target.value })} />
          </Field>
          <Field label="Copies">
            <input className="form-control" type="number" value={b.copies} onChange={(e) => setB({ ...b, copies: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => addBook(b) && setB({ ...b, title: '', isbn: '' })}>
            Add title
          </Btn>
        </Toolbar>
        <DataTable
          rows={libraryBooks}
          rowKey={(x) => x.id}
          columns={[
            { key: 't', header: 'Title', render: (x) => `${x.title} — ${x.author}` },
            { key: 'c', header: 'Category', render: (x) => x.category },
            { key: 'i', header: 'ISBN', render: (x) => x.isbn },
            { key: 'a', header: 'Available', align: 'right', render: (x) => `${x.copies - out(x.id)} of ${x.copies}` }
          ]}
        />
      </Panel>
      <Panel title="Loans">
        <Toolbar>
          <select className="form-control" value={lend.bookId} onChange={(e) => setLend({ ...lend, bookId: e.target.value })} aria-label="Book">
            <option value="">Choose a book…</option>
            {libraryBooks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
          <StaffSelect value={lend.staffId} onChange={(v) => setLend({ ...lend, staffId: v })} label="Borrower" />
          <Btn primary disabled={!canEdit} onClick={() => lendBook(lend.bookId, lend.staffId)}>
            Lend
          </Btn>
        </Toolbar>
        <DataTable
          rows={libraryLoans}
          rowKey={(l) => l.id}
          columns={[
            { key: 'b', header: 'Book', render: (l) => libraryBooks.find((x) => x.id === l.bookId)?.title ?? l.bookId },
            { key: 's', header: 'Borrower', render: (l) => nameOf(l.staffId) },
            { key: 'o', header: 'Out / due', render: (l) => `${fmt(l.out)} → ${fmt(l.due)}${l.renewed ? ' (renewed)' : ''}` },
            { key: 'st', header: 'Status', render: (l) => (l.returned ? <StatusPill status="CLOSED" label={`Returned ${fmt(l.returned)}`} /> : l.due < todayIso() ? <StatusPill status="OVERDUE" label={`Overdue · fine ${kes(loanFine(l))}`} /> : <StatusPill status="ACTIVE" label="On loan" />) },
            {
              key: 'x',
              header: 'Action',
              render: (l) =>
                l.returned ? (
                  l.fineKes ? `Fine ${kes(l.fineKes)}` : '—'
                ) : (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Btn disabled={!canEdit} onClick={() => returnBook(l.id)}>
                      Return
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => renewLoan(l.id)}>
                      Renew
                    </Btn>
                  </span>
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};

export const SERVICE_TABS = [
  { id: 'welfare', label: 'Welfare', icon: HeartHandshake },
  { id: 'medical', label: 'Medical cover', icon: Stethoscope },
  { id: 'travel', label: 'Travel & imprest', icon: Plane },
  { id: 'csr', label: 'CSR & events', icon: CalendarHeart },
  { id: 'outsourced', label: 'Outsourced labour', icon: HardHat },
  { id: 'library', label: 'Library', icon: BookOpen }
];
