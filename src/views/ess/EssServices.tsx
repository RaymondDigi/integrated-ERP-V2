import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DataTable, Field, Panel } from '../../suites/ui/kit';
import { Attachments } from '../../platform/Widgets';
import { PER_DIEM_RATES, type ClaimBenefit, type TravelRequest } from '../../data/hcmConfig';
import type { Grievance } from '../../data/securityConfig';
import { fmt, kes, limitOf, loanFine, schemeFor, todayIso, utilised } from '../../data/hcmEngine';
import { Btn, StatusPill, Toolbar } from '../hr/hcm/ui';
import { ESS_EMPLOYEE } from './essData';

/** Manager self-service: leave taken, pending and coming up for everyone who reports to the signed-in employee. */
export const TeamLeaveReport: React.FC = () => {
  const { hrEmployees, leaveRequests } = useApp();
  const year = todayIso().slice(0, 4);
  const team = hrEmployees.filter((e) => e.reportsToStaffId === ESS_EMPLOYEE.staffId && e.status !== 'TERMINATED');
  const rows = team.map((e) => {
    const mine = leaveRequests.filter((l) => l.staffId === e.staffId && l.startDate.startsWith(year));
    return {
      e,
      taken: mine.filter((l) => l.status === 'APPROVED' && l.endDate < todayIso()).reduce((n, l) => n + l.daysCount, 0),
      pending: mine.filter((l) => l.status === 'PENDING_APPROVAL').length,
      next: mine.filter((l) => l.status === 'APPROVED' && l.startDate >= todayIso()).sort((a, b) => a.startDate.localeCompare(b.startDate))[0],
      away: mine.find((l) => l.status === 'APPROVED' && l.startDate <= todayIso() && l.endDate >= todayIso())
    };
  });
  return (
    <Panel title="My team's leave" subtitle={`${team.length} people report to you · ${year}`}>
      <DataTable
        rows={rows}
        rowKey={(r) => r.e.staffId}
        empty="Nobody reports to you in the employee master."
        columns={[
          { key: 'n', header: 'Team member', render: (r) => `${r.e.fullName} · ${r.e.jobTitle}` },
          { key: 't', header: 'Days taken', align: 'right', render: (r) => r.taken, sort: (r) => r.taken },
          { key: 'p', header: 'Waiting', align: 'right', render: (r) => r.pending },
          { key: 'a', header: 'Today', render: (r) => (r.away ? <StatusPill status="PENDING" label={`On ${r.away.leaveType} to ${fmt(r.away.endDate)}`} /> : <StatusPill status="ACTIVE" label="At work" />) },
          { key: 'x', header: 'Next leave', render: (r) => (r.next ? `${r.next.leaveType}, ${fmt(r.next.startDate)} (${r.next.daysCount} days)` : '—') }
        ]}
      />
    </Panel>
  );
};

/** Employee self-service for HR services: travel and petty cash, welfare and medical claims, grievances, whistleblowing, library and events. */
export const EssServices: React.FC = () => {
  const {
    travelRequests,
    submitTravel,
    welfareSchemes,
    welfareClaims,
    submitWelfareClaim,
    medicalCovers,
    medicalClaims,
    submitMedicalClaim,
    raiseGrievance,
    reportWhistleblowing,
    lookupWhistleblowing,
    libraryLoans,
    libraryBooks,
    hrEvents,
    rsvpEvent
  } = useApp();
  const me = ESS_EMPLOYEE.staffId;
  const [tr, setTr] = useState({ kind: 'TRAVEL' as TravelRequest['kind'], purpose: '', destination: 'Nairobi', from: todayIso(), to: todayIso(), transportKes: 0, otherKes: 0 });
  const [wf, setWf] = useState({ schemeId: welfareSchemes[0]?.id ?? '', eventDate: todayIso(), details: '' });
  const [mc, setMc] = useState({ beneficiary: ESS_EMPLOYEE.fullName, benefit: 'OUTPATIENT' as ClaimBenefit, provider: '', date: todayIso(), amountKes: 0 });
  const [gr, setGr] = useState({ category: 'Grievance' as Grievance['category'], subject: '', details: '', confidential: true });
  const [wb, setWb] = useState({ category: 'Fraud' as Grievance['category'], subject: '', details: '' });
  const [code, setCode] = useState('');
  const [track, setTrack] = useState('');
  const cover = medicalCovers.find((c) => c.staffId === me);
  const found = track.trim() ? lookupWhistleblowing(track.trim()) : null;
  return (
    <div className="ess-stack">
      <Panel title="Travel & petty cash" subtitle="Goes to your line manager, then Finance issues the money. Surrender receipts within 7 days of return.">
        <div className="sx-grid">
          <Field label="Type">
            <select className="form-control" value={tr.kind} onChange={(e) => setTr({ ...tr, kind: e.target.value as TravelRequest['kind'] })}>
              <option value="TRAVEL">Travel & imprest</option>
              <option value="PETTY_CASH">Petty cash</option>
            </select>
          </Field>
          <Field label="Purpose" span={2}>
            <input className="form-control" value={tr.purpose} onChange={(e) => setTr({ ...tr, purpose: e.target.value })} />
          </Field>
          <Field label="Destination">
            <select className="form-control" value={tr.destination} onChange={(e) => setTr({ ...tr, destination: e.target.value })}>
              {PER_DIEM_RATES.flatMap((b) => b.destinations).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input className="form-control" type="date" value={tr.from} onChange={(e) => setTr({ ...tr, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="form-control" type="date" value={tr.to} onChange={(e) => setTr({ ...tr, to: e.target.value })} />
          </Field>
          <Field label="Transport (KES)">
            <input className="form-control" type="number" value={tr.transportKes || ''} onChange={(e) => setTr({ ...tr, transportKes: Number(e.target.value) })} />
          </Field>
          <Field label="Other (KES)">
            <input className="form-control" type="number" value={tr.otherKes || ''} onChange={(e) => setTr({ ...tr, otherKes: Number(e.target.value) })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary onClick={() => submitTravel({ ...tr, staffId: me }) && setTr({ ...tr, purpose: '' })}>
            Submit request
          </Btn>
        </Toolbar>
        <DataTable
          rows={travelRequests.filter((t) => t.staffId === me)}
          rowKey={(t) => t.id}
          empty="No travel or petty cash requests."
          columns={[
            { key: 'id', header: 'Request', render: (t) => `${t.id} · ${t.purpose}` },
            { key: 'a', header: 'Amount', align: 'right', render: (t) => kes(t.totalKes) },
            { key: 's', header: 'Status', render: (t) => <StatusPill status={t.status} /> }
          ]}
        />
      </Panel>
      <Panel title="Welfare claim" subtitle="Bereavement, wedding, hospitalisation and other benefits — paid through payroll once HR approves.">
        <div className="sx-grid">
          <Field label="Entitlement">
            <select className="form-control" value={wf.schemeId} onChange={(e) => setWf({ ...wf, schemeId: e.target.value })}>
              {welfareSchemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.event} — {kes(s.amountKes)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of the event">
            <input className="form-control" type="date" value={wf.eventDate} onChange={(e) => setWf({ ...wf, eventDate: e.target.value })} />
          </Field>
          <Field label="Details" span={2}>
            <input className="form-control" value={wf.details} onChange={(e) => setWf({ ...wf, details: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary onClick={() => submitWelfareClaim({ ...wf, staffId: me }) && setWf({ ...wf, details: '' })}>
            Submit claim
          </Btn>
        </Toolbar>
        <DataTable
          rows={welfareClaims.filter((c) => c.staffId === me)}
          rowKey={(c) => c.id}
          empty="No welfare claims."
          columns={[
            { key: 'id', header: 'Claim', render: (c) => `${c.id} · ${welfareSchemes.find((s) => s.id === c.schemeId)?.event ?? c.schemeId}` },
            { key: 'a', header: 'Amount', align: 'right', render: (c) => kes(c.amountKes) },
            { key: 's', header: 'Status', render: (c) => <StatusPill status={c.status} /> }
          ]}
        />
        <Attachments owner={`ESS-WELFARE-${me}`} by={ESS_EMPLOYEE.fullName} title="Supporting documents (death certificate, discharge summary…)" />
      </Panel>
      <Panel title="Medical cover" subtitle={cover ? `${schemeFor(cover)?.name} (${schemeFor(cover)?.insurer}) · member ${cover.memberNo}` : 'You are not on a company medical scheme yet — ask HR.'}>
        {cover && (
          <>
            <p className="muted">
              Outpatient used {kes(utilised(medicalClaims, me, 'OUTPATIENT'))} of {kes(limitOf(cover.schemeId, 'OUTPATIENT'))} · inpatient used {kes(utilised(medicalClaims, me, 'INPATIENT'))} of {kes(limitOf(cover.schemeId, 'INPATIENT'))}
            </p>
            <div className="sx-grid">
              <Field label="Beneficiary">
                <select className="form-control" value={mc.beneficiary} onChange={(e) => setMc({ ...mc, beneficiary: e.target.value })}>
                  <option>{ESS_EMPLOYEE.fullName}</option>
                  {cover.dependants.map((d) => (
                    <option key={d.name}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Benefit">
                <select className="form-control" value={mc.benefit} onChange={(e) => setMc({ ...mc, benefit: e.target.value as ClaimBenefit })}>
                  {(['OUTPATIENT', 'INPATIENT', 'DENTAL', 'OPTICAL'] as const).map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Provider">
                <input className="form-control" value={mc.provider} onChange={(e) => setMc({ ...mc, provider: e.target.value })} />
              </Field>
              <Field label="Amount (KES)">
                <input className="form-control" type="number" value={mc.amountKes || ''} onChange={(e) => setMc({ ...mc, amountKes: Number(e.target.value) })} />
              </Field>
            </div>
            <Toolbar>
              <Btn primary onClick={() => submitMedicalClaim({ ...mc, staffId: me })}>
                Submit medical claim
              </Btn>
            </Toolbar>
          </>
        )}
      </Panel>
      <Panel title="Raise a grievance" subtitle="Grievances and harassment complaints go to HR in confidence. You get a reply within 14 days.">
        <div className="sx-grid">
          <Field label="Category">
            <select className="form-control" value={gr.category} onChange={(e) => setGr({ ...gr, category: e.target.value as Grievance['category'] })}>
              {['Grievance', 'Harassment', 'Discrimination', 'Working conditions', 'Safety', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Subject" span={2}>
            <input className="form-control" value={gr.subject} onChange={(e) => setGr({ ...gr, subject: e.target.value })} />
          </Field>
          <Field label="Details" span={4}>
            <textarea className="form-control" rows={2} value={gr.details} onChange={(e) => setGr({ ...gr, details: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary onClick={() => raiseGrievance({ channel: 'STAFF', ...gr, staffId: me }) && setGr({ ...gr, subject: '', details: '' })}>
            Submit grievance
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Speak up anonymously" subtitle="Report fraud, corruption or misconduct without giving your name. Keep the tracking code to follow up — nobody can trace it back to you.">
        <div className="sx-grid">
          <Field label="Category">
            <select className="form-control" value={wb.category} onChange={(e) => setWb({ ...wb, category: e.target.value as Grievance['category'] })}>
              {['Fraud', 'Corruption', 'Harassment', 'Safety', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Subject" span={3}>
            <input className="form-control" value={wb.subject} onChange={(e) => setWb({ ...wb, subject: e.target.value })} />
          </Field>
          <Field label="What happened" span={4}>
            <textarea className="form-control" rows={2} value={wb.details} onChange={(e) => setWb({ ...wb, details: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn
            primary
            onClick={() => {
              const c = reportWhistleblowing(wb);
              if (c) {
                setCode(c);
                setWb({ ...wb, subject: '', details: '' });
              }
            }}
          >
            Submit anonymously
          </Btn>
          {code && <b>Tracking code: {code}</b>}
          <input className="form-control" style={{ width: 180 }} placeholder="Check a tracking code" value={track} onChange={(e) => setTrack(e.target.value)} />
          {found && (
            <span>
              <StatusPill status={found.status} /> · reply due {fmt(found.responseDue)}
            </span>
          )}
        </Toolbar>
      </Panel>
      <Panel title="Library & events">
        <DataTable
          rows={libraryLoans.filter((l) => l.staffId === me && !l.returned)}
          rowKey={(l) => l.id}
          empty="No books on loan."
          columns={[
            { key: 'b', header: 'Book', render: (l) => libraryBooks.find((b) => b.id === l.bookId)?.title ?? l.bookId },
            { key: 'd', header: 'Due', render: (l) => (l.due < todayIso() ? <StatusPill status="OVERDUE" label={`${fmt(l.due)} · fine ${kes(loanFine(l))}`} /> : fmt(l.due)) }
          ]}
        />
        <DataTable
          rows={hrEvents.filter((e) => e.status === 'APPROVED' && e.invitees.includes(me))}
          rowKey={(e) => e.id}
          empty="No event invitations."
          columns={[
            { key: 't', header: 'Event', render: (e) => `${e.title} — ${fmt(e.date)}, ${e.venue}` },
            { key: 'r', header: 'Your answer', render: (e) => e.rsvp[me] ?? 'Not answered' },
            {
              key: 'x',
              header: '',
              render: (e) => (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Btn onClick={() => rsvpEvent(e.id, me, 'YES')}>Attending</Btn>
                  <Btn onClick={() => rsvpEvent(e.id, me, 'NO')}>Can’t make it</Btn>
                </span>
              )
            }
          ]}
        />
      </Panel>
    </div>
  );
};
