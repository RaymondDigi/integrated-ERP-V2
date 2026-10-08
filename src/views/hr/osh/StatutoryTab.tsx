import React, { useMemo, useState } from 'react';
import { OshAuditAndReturns } from '../hcm/OshExtras';
import { ExternalLink, FileCheck, Users } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useControl } from '../../../suites/control/store';
import { Modal } from '../payroll/shared';
import { STATUTORY_KINDS } from '../../../data/oshConfig';
import { addMonths, statutoryDue, type StatutoryItem } from '../../../data/oshEngine';
import { ActionTable, dueLabel, Empty, fmt, NewActionRow, Pill, useOshOrg } from './shared';

export const StatutoryTab: React.FC = () => {
  const { oshStatutory, oshCommittee, committeeMeetings, selectedOrgId, setCurrentView } = useApp();
  const ctl = useControl();
  const org = useOshOrg();
  const [exam, setExam] = useState<StatutoryItem | null>(null);
  const [meeting, setMeeting] = useState(false);
  const items = useMemo(() => oshStatutory.filter((s) => s.orgId === selectedOrgId).sort((a, b) => statutoryDue(a).localeCompare(statutoryDue(b))), [oshStatutory, selectedOrgId]);
  const meetings = committeeMeetings.filter((m) => m.orgId === selectedOrgId).sort((a, b) => b.date.localeCompare(a.date));
  const committee = selectedOrgId === 'org-kericho' ? oshCommittee : [];
  const nextMeeting = meetings[0] ? addMonths(meetings[0].date, 3) : org.today;
  const md = dueLabel(org.today, nextMeeting, 14);
  // DOSHS certificates are held in the Governance permits register; shown here read-only
  const doshsPermits = ctl.state.permits.filter((p) => /DOSH/i.test(p.issuer) || /fire/i.test(p.name));
  const workers = committee.filter((c) => c.side === 'Workers').length;

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Statutory audits and examinations</h3>
            <p>Annual safety & health and fire audits by DOSHS-approved auditors; boilers every 14 months, steam and air receivers every 26 months, hoists and lifting equipment every 6 months (OSHA 2007 Part VIII).</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Requirement</th>
                <th>Last done</th>
                <th>Next due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <Empty cols={5}>No statutory items for this company.</Empty>}
              {items.map((s) => {
                const due = statutoryDue(s);
                const d = dueLabel(org.today, due, 45);
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      <div className="muted">Certificate {s.ref}</div>
                    </td>
                    <td>
                      {STATUTORY_KINDS[s.kind].label}
                      <div className="muted">{STATUTORY_KINDS[s.kind].by}</div>
                    </td>
                    <td>
                      {fmt(s.lastDone)}
                      <div className="muted">{s.by}</div>
                    </td>
                    <td>
                      <Pill cls={d.cls}>{d.cls === 'success' ? fmt(due) : d.text}</Pill>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setExam(s)}>
                        <FileCheck size={13} /> Record
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>DOSHS certificates</h3>
            <p>Workplace registration and other DOSHS certificates are kept in the company permits register (Governance). Shown here for reference.</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              ctl.setGovernance('permits');
              setCurrentView('governance');
            }}
          >
            <ExternalLink size={14} /> Open permits register
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Issuer</th>
                <th>Site</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {doshsPermits.length === 0 && <Empty cols={4}>None in the register.</Empty>}
              {doshsPermits.map((p) => {
                const d = dueLabel(org.today, p.expiry, 45);
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted">{p.number}</div>
                    </td>
                    <td>{p.issuer}</td>
                    <td>{p.site}</td>
                    <td>
                      <Pill cls={d.cls}>{d.cls === 'success' ? fmt(p.expiry) : d.text}</Pill>
                      {p.renewalStarted && <div className="muted">Renewal started</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Safety & health committee</h3>
            <p>Required with 20 or more workers; meets at least quarterly and keeps minutes for the DOSHS inspector (Safety and Health Committees Rules 2004).</p>
          </div>
          <button className="btn btn-primary" disabled={!committee.length} onClick={() => setMeeting(true)}>
            <Users size={14} /> Record meeting
          </button>
        </div>
        <div className="pr-kv osh-kv-gap">
          <div>
            <span>Members</span>
            <strong>{committee.length}</strong>
            <small>
              {workers} workers' representatives · {committee.filter((c) => !c.trained).length} not yet trained
            </small>
          </div>
          <div>
            <span>Next meeting</span>
            <div className="osh-kv-pill">
              <Pill cls={md.cls}>{md.cls === 'success' ? fmt(nextMeeting) : md.text}</Pill>
            </div>
            <small>Last {meetings[0] ? fmt(meetings[0].date) : 'never'}</small>
          </div>
        </div>
        {committee.length > 0 && (
          <ul className="osh-members">
            {committee.map((c) => (
              <li key={c.staffId}>
                <strong>{org.name(c.staffId)}</strong>
                <span className="pr-muted">
                  {c.role} · {c.side}
                  {!c.trained && ' · training needed'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <h4 className="osh-h4">Minutes</h4>
        {meetings.length === 0 && <p className="pr-muted">No meetings recorded.</p>}
        {meetings.map((m) => (
          <div key={m.id} className="osh-minutes">
            <div className="osh-minutes-head">
              <strong>{fmt(m.date)}</strong>
              <span className="pr-muted">{m.attendees.length} attended</span>
            </div>
            <p>{m.minutes}</p>
            {m.actions.length > 0 && <ActionTable actions={m.actions} refOf={(a) => ({ source: 'meeting', id: m.id, actionId: a.id })} today={org.today} />}
          </div>
        ))}
      </div>

      <OshAuditAndReturns />
      {exam && <ExamModal s={exam} onClose={() => setExam(null)} />}
      {meeting && <MeetingModal onClose={() => setMeeting(false)} />}
    </>
  );
};

const ExamModal: React.FC<{ s: StatutoryItem; onClose: () => void }> = ({ s, onClose }) => {
  const { recordStatutory } = useApp();
  const org = useOshOrg();
  const [on, setOn] = useState(org.today);
  const [ref, setRef] = useState('');
  const [by, setBy] = useState(s.by);
  return (
    <Modal
      title={`Record · ${s.name}`}
      subtitle={STATUTORY_KINDS[s.kind].label}
      onClose={onClose}
      width={600}
      footer={
        <button
          className="btn btn-primary"
          disabled={!ref.trim()}
          onClick={() => {
            recordStatutory(s.id, on, ref.trim(), by.trim());
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Date done</span>
          <input className="form-control" type="date" max={org.today} value={on} onChange={(ev) => setOn(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Certificate / report no.</span>
          <input className="form-control" value={ref} onChange={(ev) => setRef(ev.target.value)} />
        </label>
        <label className="req-field wide">
          <span>Done by</span>
          <input className="form-control" value={by} onChange={(ev) => setBy(ev.target.value)} />
        </label>
      </div>
      <p className="pr-muted">Next due {fmt(addMonths(on, STATUTORY_KINDS[s.kind].everyMonths))}.</p>
    </Modal>
  );
};

const MeetingModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { oshCommittee, recordMeeting } = useApp();
  const org = useOshOrg();
  const [date, setDate] = useState(org.today);
  const [att, setAtt] = useState<string[]>(oshCommittee.map((c) => c.staffId));
  const [minutes, setMinutes] = useState('');
  const [actions, setActions] = useState<{ text: string; owner: string; due: string }[]>([]);
  return (
    <Modal
      title="Record committee meeting"
      onClose={onClose}
      width={760}
      footer={
        <button
          className="btn btn-primary"
          disabled={!minutes.trim()}
          onClick={() => {
            recordMeeting({ date, attendees: att, minutes: minutes.trim() }, actions);
            onClose();
          }}
        >
          Save minutes
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Date</span>
          <input className="form-control" type="date" max={org.today} value={date} onChange={(ev) => setDate(ev.target.value)} />
        </label>
        <div className="req-field">
          <span>Attended</span>
          <div className="osh-checkcol">
            {oshCommittee.map((c) => (
              <label key={c.staffId} className="osh-check-row">
                <input type="checkbox" checked={att.includes(c.staffId)} onChange={(ev) => setAtt(ev.target.checked ? [...att, c.staffId] : att.filter((x) => x !== c.staffId))} /> {org.name(c.staffId)}
              </label>
            ))}
          </div>
        </div>
        <label className="req-field wide">
          <span>Minutes</span>
          <textarea className="form-control" rows={4} value={minutes} onChange={(ev) => setMinutes(ev.target.value)} placeholder="Incidents reviewed, inspection findings, decisions." />
        </label>
      </div>
      {actions.length > 0 && (
        <ul className="osh-history">
          {actions.map((a, k) => (
            <li key={k}>
              {a.text} — {a.owner}, due {fmt(a.due)}
            </li>
          ))}
        </ul>
      )}
      <NewActionRow
        staff={org.staff}
        today={org.today}
        onAdd={(a) => {
          setActions([...actions, a]);
        }}
      />
    </Modal>
  );
};
