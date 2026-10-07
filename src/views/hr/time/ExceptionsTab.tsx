import React, { useMemo, useState } from 'react';
import { Check, Clock3, Gavel, History, Search, Undo2, Wrench, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { TIME_RULES, isCasual } from '../../../data/timeConfig';
import { addDays, EXCEPTION_LABEL, exceptionsOf, fmtDate, fmtMin, fmtShort, type DecisionStatus, type ExceptionKind, type TimeException } from '../../../data/timeEngine';
import { caseAbsenceKeys } from '../../../data/discipline';
import { Chips, EmpCell, Empty, KIND_CLS, NotTracked, Pill, useTimeOrg } from './shared';
import { NewCaseModal } from './CaseForms';

type KindFilter = 'ALL' | 'MISSING' | 'ABSENT' | 'TIMEKEEPING' | 'OVERTIME' | 'GEOFENCE';
const KIND_GROUP: Record<ExceptionKind, KindFilter> = { MISSING_OUT: 'MISSING', MISSING_IN: 'MISSING', ABSENT: 'ABSENT', LATE: 'TIMEKEEPING', EARLY: 'TIMEKEEPING', OVERTIME: 'OVERTIME', GEOFENCE: 'GEOFENCE' };

export const DECISION_LABEL: Record<DecisionStatus, { label: string; cls: string }> = {
  APPROVED: { label: 'Approved', cls: 'success' },
  REJECTED: { label: 'Rejected', cls: 'critical' },
  AUTHORISED: { label: 'Authorised', cls: 'success' },
  UNAUTHORISED: { label: 'Unauthorised', cls: 'critical' },
  EXCUSED: { label: 'Excused', cls: 'success' },
  FIXED: { label: 'Corrected', cls: 'success' },
  ACCEPTED: { label: 'Accepted', cls: 'success' },
  NOTED: { label: 'Noted', cls: 'primary' }
};

type Dialog =
  | { kind: 'fix'; x: TimeException }
  | { kind: 'absence'; x: TimeException; status: 'AUTHORISED' | 'UNAUTHORISED' }
  | { kind: 'case'; x: TimeException }
  | { kind: 'decide'; keys: string[]; status: DecisionStatus; title: string };

export const ExceptionsTab: React.FC = () => {
  const { timeDecisions, overtimeSent, disciplinaryCases, decideTimeExceptions, reopenTimeException, timeAudit, setCurrentView, setModuleTab } = useApp();
  const { byId, days, tracked, today } = useTimeOrg();
  const [state, setState] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const from = addDays(today, -TIME_RULES.queueDays);

  const all = useMemo(() => exceptionsOf(days, from), [days, from]);
  const caseOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of disciplinaryCases) for (const k of caseAbsenceKeys(c)) m.set(k, c.id);
    return m;
  }, [disciplinaryCases]);
  const scoped = useMemo(() => all.filter((x) => (state === 'ALL' ? true : state === 'OPEN' ? !timeDecisions[x.key] : !!timeDecisions[x.key])), [all, state, timeDecisions]);
  const count = (k: KindFilter) => scoped.filter((x) => k === 'ALL' || KIND_GROUP[x.kind] === k).length;
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return scoped
      .filter((x) => kind === 'ALL' || KIND_GROUP[x.kind] === kind)
      .filter((x) => !s || `${x.staffId} ${byId.get(x.staffId)?.fullName}`.toLowerCase().includes(s))
      .sort((a, b) => b.date.localeCompare(a.date) || a.staffId.localeCompare(b.staffId));
  }, [scoped, kind, q, byId]);
  const pg = usePaged(rows, 25, `${state}|${kind}|${q}`);

  if (!tracked) return <NotTracked />;

  const bulkable = (x: TimeException) => !timeDecisions[x.key] && ['OVERTIME', 'LATE', 'EARLY', 'GEOFENCE'].includes(x.kind);
  const selected = rows.filter((x) => sel.includes(x.key));
  const selKinds = new Set(selected.map((x) => KIND_GROUP[x.kind]));
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const pageBulk = pg.rows.filter(bulkable);
  const allOnPage = pageBulk.length > 0 && pageBulk.every((x) => sel.includes(x.key));

  const openAbsences = (staffId: string) => all.filter((x) => x.kind === 'ABSENT' && x.staffId === staffId && timeDecisions[x.key]?.status !== 'AUTHORISED').map((x) => x.date).sort();
  const goCase = (id: string) => {
    setModuleTab('disciplinary', 'cases');
    setModuleTab('disciplinary-case', id);
    setCurrentView('disciplinary');
  };

  const actions = (x: TimeException) => {
    const dec = timeDecisions[x.key];
    const cid = caseOf.get(x.key);
    const caseChip = cid && (
      <button className="tm-link" onClick={() => goCase(cid)}>
        Case {cid}
      </button>
    );
    if (dec)
      return (
        <div className="tm-actions">
          {caseChip ||
            ((x.kind === 'ABSENT' && dec.status === 'UNAUTHORISED') || (x.kind === 'LATE' && dec.status === 'NOTED') ? (
              <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'case', x })}>
                <Gavel size={12} /> Raise case
              </button>
            ) : null)}
          {!overtimeSent[x.key] && !dec.seeded && (
            <button className="btn btn-secondary btn-xs" onClick={() => reopenTimeException(x.key)} title="Undo this decision">
              <Undo2 size={12} /> Reopen
            </button>
          )}
        </div>
      );
    switch (x.kind) {
      case 'MISSING_OUT':
      case 'MISSING_IN':
        return (
          <div className="tm-actions">
            <button className="btn btn-primary btn-xs" onClick={() => setDialog({ kind: 'fix', x })}>
              <Wrench size={12} /> Fix punch
            </button>
          </div>
        );
      case 'ABSENT':
        return (
          <div className="tm-actions">
            <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'absence', x, status: 'AUTHORISED' })}>
              Authorise
            </button>
            <button className="btn btn-secondary btn-xs tm-danger" onClick={() => setDialog({ kind: 'absence', x, status: 'UNAUTHORISED' })}>
              Unauthorised
            </button>
            {caseChip || (
              <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'case', x })}>
                <Gavel size={12} /> Raise case
              </button>
            )}
          </div>
        );
      case 'LATE':
      case 'EARLY':
        return (
          <div className="tm-actions">
            <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'decide', keys: [x.key], status: 'EXCUSED', title: `Excuse ${EXCEPTION_LABEL[x.kind].toLowerCase()}` })}>
              Excuse
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => decideTimeExceptions([x.key], 'NOTED', 'Recorded on file')}>
              Note
            </button>
            {caseChip || (
              <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'case', x })}>
                <Gavel size={12} /> Raise case
              </button>
            )}
          </div>
        );
      case 'OVERTIME':
        return (
          <div className="tm-actions">
            <button className="btn btn-primary btn-xs" onClick={() => decideTimeExceptions([x.key], 'APPROVED', 'Approved by supervisor')}>
              <Check size={12} /> Approve
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'decide', keys: [x.key], status: 'REJECTED', title: 'Reject overtime' })}>
              <X size={12} /> Reject
            </button>
          </div>
        );
      case 'GEOFENCE':
        return (
          <div className="tm-actions">
            <button className="btn btn-secondary btn-xs" onClick={() => decideTimeExceptions([x.key], 'ACCEPTED', 'Location confirmed by supervisor')}>
              Accept
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'decide', keys: [x.key], status: 'REJECTED', title: 'Reject punch location' })}>
              Reject
            </button>
          </div>
        );
    }
  };

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Exceptions queue</h3>
            <p>
              Last {TIME_RULES.queueDays / 7} weeks, from {fmtDate(from)}. Supervisors fix punches and approve overtime; HR confirms absences, which feed payroll.
            </p>
          </div>
          <Chips
            label="Decision state"
            value={state}
            onChange={(v) => {
              setState(v);
              setSel([]);
            }}
            options={[
              { id: 'OPEN', label: 'To do', n: all.filter((x) => !timeDecisions[x.key]).length },
              { id: 'RESOLVED', label: 'Resolved' },
              { id: 'ALL', label: 'All' }
            ]}
          />
        </div>
        <Chips
          label="Exception type"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSel([]);
          }}
          options={[
            { id: 'ALL', label: 'All', n: count('ALL') },
            { id: 'MISSING', label: 'Missing punch', n: count('MISSING') },
            { id: 'ABSENT', label: 'Absence', n: count('ABSENT') },
            { id: 'TIMEKEEPING', label: 'Late / early', n: count('TIMEKEEPING') },
            { id: 'OVERTIME', label: 'Overtime', n: count('OVERTIME') },
            { id: 'GEOFENCE', label: 'Geofence', n: count('GEOFENCE') }
          ]}
        />
        <div className="pr-toolbar" style={{ margin: '12px 0' }}>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name or staff ID" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
          {selected.length > 0 && (
            <div className="tm-bulk">
              <span>{selected.length} selected</span>
              {selKinds.size === 1 && selKinds.has('OVERTIME') && (
                <>
                  <button className="btn btn-primary btn-xs" onClick={() => (decideTimeExceptions(selected.map((x) => x.key), 'APPROVED', 'Approved by supervisor'), setSel([]))}>
                    <Check size={12} /> Approve
                  </button>
                  <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'decide', keys: selected.map((x) => x.key), status: 'REJECTED', title: `Reject ${selected.length} overtime days` })}>
                    Reject
                  </button>
                </>
              )}
              {selKinds.size === 1 && selKinds.has('TIMEKEEPING') && (
                <button className="btn btn-secondary btn-xs" onClick={() => setDialog({ kind: 'decide', keys: selected.map((x) => x.key), status: 'EXCUSED', title: `Excuse ${selected.length} items` })}>
                  Excuse
                </button>
              )}
              {selKinds.size === 1 && selKinds.has('GEOFENCE') && (
                <button className="btn btn-secondary btn-xs" onClick={() => (decideTimeExceptions(selected.map((x) => x.key), 'ACCEPTED', 'Location confirmed by supervisor'), setSel([]))}>
                  Accept
                </button>
              )}
              {selKinds.size > 1 && <span className="pr-muted">Pick one type to act on together</span>}
              <button className="btn btn-secondary btn-xs" onClick={() => setSel([])}>
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" aria-label="Select all on this page" disabled={!pageBulk.length} checked={allOnPage} onChange={() => setSel((s) => (allOnPage ? s.filter((k) => !pageBulk.some((x) => x.key === k)) : [...new Set([...s, ...pageBulk.map((x) => x.key)])]))} />
                </th>
                <th>Date</th>
                <th>Employee</th>
                <th>Exception</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={6}>{state === 'OPEN' ? 'Nothing waiting. Every exception has been dealt with.' : 'No exceptions match.'}</Empty>}
              {pg.rows.map((x) => {
                const dec = timeDecisions[x.key];
                const e = byId.get(x.staffId);
                return (
                  <tr key={x.key}>
                    <td>{bulkable(x) && <input type="checkbox" aria-label={`Select ${x.staffId} ${x.date}`} checked={sel.includes(x.key)} onChange={() => toggle(x.key)} />}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtShort(x.date)}</td>
                    <td>
                      <EmpCell e={e} id={x.staffId} sub={e?.department} />
                    </td>
                    <td>
                      <Pill cls={KIND_CLS[x.kind]}>{EXCEPTION_LABEL[x.kind]}</Pill>
                      <div className="muted" style={{ marginTop: 3 }}>
                        {x.detail}
                      </div>
                    </td>
                    <td>
                      {dec ? (
                        <>
                          <Pill cls={DECISION_LABEL[dec.status].cls}>{DECISION_LABEL[dec.status].label}</Pill>
                          <div className="muted">
                            {dec.by} · {fmtShort(dec.at)}
                            {dec.reason ? ` · ${dec.reason}` : ''}
                          </div>
                          {dec.reductionId && <div className="muted">Pay withheld ({dec.reductionId})</div>}
                          {overtimeSent[x.key] && <div className="muted">{overtimeSent[x.key].reference}</div>}
                        </>
                      ) : (
                        <span className="muted">
                          <Clock3 size={12} style={{ verticalAlign: -2 }} /> Waiting
                        </span>
                      )}
                    </td>
                    <td>{actions(x)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="exceptions" />
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>
              <History size={15} style={{ verticalAlign: -2 }} /> Audit trail
            </h3>
            <p>Every correction and decision made in this session, newest first. Corrected punches also keep their reason on the punch.</p>
          </div>
        </div>
        {timeAudit.length === 0 ? (
          <p className="pr-muted">No changes yet.</p>
        ) : (
          <ul className="tm-timeline">
            {timeAudit.slice(0, 30).map((a, i) => (
              <li key={i}>
                <span>{a.at}</span>
                <strong>{a.by}</strong> {a.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog?.kind === 'fix' && <FixPunchModal x={dialog.x} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'absence' && <AbsenceModal x={dialog.x} status={dialog.status} dates={openAbsences(dialog.x.staffId)} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'case' && (
        <NewCaseModal
          staffId={dialog.x.staffId}
          category={dialog.x.kind === 'ABSENT' ? 'ABSENTEEISM' : 'LATENESS'}
          dates={(dialog.x.kind === 'ABSENT' ? openAbsences(dialog.x.staffId) : all.filter((y) => y.kind === dialog.x.kind && y.staffId === dialog.x.staffId).map((y) => y.date).sort()).filter(
            (d) => !caseOf.has(`${dialog.x.kind === 'ABSENT' ? 'ABSENT' : 'LATE'}|${dialog.x.staffId}|${d}`)
          )}
          summary={
            dialog.x.kind === 'ABSENT'
              ? `Absent without leave or notice; no punches recorded on rostered days.`
              : `Late arrival on rostered shifts after an informal reminder.`
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'decide' && (
        <DecideModal
          title={dialog.title}
          status={dialog.status}
          n={dialog.keys.length}
          onClose={() => setDialog(null)}
          onSave={(reason) => {
            decideTimeExceptions(dialog.keys, dialog.status, reason);
            setSel([]);
            setDialog(null);
          }}
        />
      )}
    </>
  );
};

const DecideModal: React.FC<{ title: string; status: DecisionStatus; n: number; onClose: () => void; onSave: (reason: string) => void }> = ({ title, status, n, onClose, onSave }) => {
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={title}
      subtitle={`${n} item${n > 1 ? 's' : ''} will be marked ${DECISION_LABEL[status].label.toLowerCase()}.`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => onSave(reason.trim())}>
            Save
          </button>
        </>
      }
    >
      <label className="req-field">
        <span>Reason</span>
        <textarea className="form-control" rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder={status === 'REJECTED' ? 'e.g. Not pre-authorised; line was idle' : 'e.g. Staff bus broke down'} />
      </label>
    </Modal>
  );
};

const FixPunchModal: React.FC<{ x: TimeException; onClose: () => void }> = ({ x, onClose }) => {
  const { fixMissingPunch } = useApp();
  const { byId } = useTimeOrg();
  const dir = x.kind === 'MISSING_IN' ? 'IN' : 'OUT';
  const s = x.day.schedule;
  const [hm, setHm] = useState(fmtMin(dir === 'OUT' ? s.end : s.start).slice(0, 5));
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={`Add missing punch-${dir === 'OUT' ? 'out' : 'in'}`}
      subtitle={`${byId.get(x.staffId)?.fullName ?? x.staffId} · ${fmtDate(x.date, true)} · ${s.name} ${fmtMin(s.start)}–${fmtMin(s.end)}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!hm || !reason.trim()}
            onClick={() => {
              fixMissingPunch(x.staffId, x.date, dir, hm, reason);
              onClose();
            }}
          >
            Save correction
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Recorded punch</span>
          <input className="form-control" disabled value={x.day.inMin !== undefined ? `In ${fmtMin(x.day.inMin)}` : x.day.outMin !== undefined ? `Out ${fmtMin(x.day.outMin)}` : '—'} />
        </label>
        <label className="req-field">
          <span>{dir === 'OUT' ? 'Time out' : 'Time in'}</span>
          <input className="form-control" type="time" value={hm} onChange={(ev) => setHm(ev.target.value)} />
        </label>
        <label className="req-field wide">
          <span>Reason (kept for audit)</span>
          <textarea className="form-control" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Turnstile offline at shift end; confirmed with the line leader" />
        </label>
      </div>
      <div className="pr-note">The correction is saved as a manual punch with your name and reason. Hours, overtime and the muster roll are recalculated straight away.</div>
    </Modal>
  );
};

const AbsenceModal: React.FC<{ x: TimeException; status: 'AUTHORISED' | 'UNAUTHORISED'; dates: string[]; onClose: () => void }> = ({ x, status, dates, onClose }) => {
  const { confirmAbsences, payrollOpenPeriod, timeDecisions } = useApp();
  const { byId, openStart } = useTimeOrg();
  const e = byId.get(x.staffId);
  const undecided = dates.filter((d) => !timeDecisions[`ABSENT|${x.staffId}|${d}`]);
  const [picked, setPicked] = useState<string[]>([x.date]);
  const [reason, setReason] = useState(status === 'AUTHORISED' ? '' : 'No reason given');
  const casual = e ? isCasual(e) : false;
  const deduct = status === 'UNAUTHORISED' && !casual ? picked.filter((d) => d >= openStart) : [];
  const locked = status === 'UNAUTHORISED' && !casual ? picked.filter((d) => d < openStart) : [];
  return (
    <Modal
      title={status === 'AUTHORISED' ? 'Authorise absence' : 'Confirm unauthorised absence'}
      subtitle={`${e?.fullName ?? x.staffId} · ${x.staffId} · ${e?.department ?? ''}`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${status === 'UNAUTHORISED' ? 'btn-primary tm-btn-danger' : 'btn-primary'}`}
            disabled={!picked.length || !reason.trim()}
            onClick={() => {
              confirmAbsences(x.staffId, picked, status, reason.trim());
              onClose();
            }}
          >
            {status === 'AUTHORISED' ? 'Authorise' : deduct.length ? `Confirm and withhold ${deduct.length} day${deduct.length > 1 ? 's' : ''}` : 'Confirm'}
          </button>
        </>
      }
    >
      <div className="req-field">
        <span>Days</span>
        <div className="tm-checks">
          {undecided.map((d) => (
            <label key={d}>
              <input type="checkbox" checked={picked.includes(d)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, d].sort() : picked.filter((y) => y !== d))} /> {fmtDate(d, true)}
              {d < openStart && <span className="pr-muted"> · paid month</span>}
            </label>
          ))}
        </div>
      </div>
      <label className="req-field">
        <span>{status === 'AUTHORISED' ? 'Reason' : 'Note'}</span>
        <textarea className="form-control" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder={status === 'AUTHORISED' ? 'e.g. Sick; doctor’s note received' : ''} />
      </label>
      {status === 'UNAUTHORISED' &&
        (casual ? (
          <div className="pr-note">Daily-rated staff are paid only for days worked, so there is nothing to withhold.</div>
        ) : (
          <div className={`pr-note ${locked.length ? 'warn' : ''}`}>
            {deduct.length > 0 && (
              <>
                Payroll will withhold {deduct.length} day{deduct.length > 1 ? 's' : ''} of pay in {payrollOpenPeriod.label} (Absent without leave).{' '}
              </>
            )}
            {locked.length > 0 && <>{locked.length} day{locked.length > 1 ? 's fall' : ' falls'} in a month already paid, so they are recorded without a deduction.</>}
          </div>
        ))}
    </Modal>
  );
};
