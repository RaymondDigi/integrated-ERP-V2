import React, { useMemo, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../payroll/shared';
import { BOND_THRESHOLD, bondMonthsFor, courseById, type TrainingBond } from '../../../data/trainingConfig';
import { bondEnd, bondRecoveryFor, kes, monthsServed } from '../../../data/trainingEngine';
import { fmtDate } from '../../../data/timeEngine';
import { EmpCell, Empty, Pill, useTrainingOrg } from './shared';

const STATUS_CLS: Record<TrainingBond['status'], string> = { Active: 'warning', Released: 'success', Recovered: 'info', Waived: 'primary' };

export const BondsTab: React.FC = () => {
  const { trainingBonds, addTrainingBond, setBondStatus, selectedOrgId } = useApp();
  const { byId, sessions, today } = useTrainingOrg();
  const [exitOn, setExitOn] = useState(today);
  const [draft, setDraft] = useState<Omit<TrainingBond, 'id' | 'orgId' | 'status'> | null>(null);

  const bonds = trainingBonds.filter((b) => b.orgId === selectedOrgId);
  const owedTotal = bonds.reduce((s, b) => s + bondRecoveryFor(b.staffId, exitOn, [b]).owed, 0);

  // People on expensive courses with no bond on file
  const unbonded = useMemo(
    () =>
      sessions
        .filter((s) => s.status !== 'Cancelled' && (courseById(s.courseId)?.costPerHead ?? 0) >= BOND_THRESHOLD)
        .flatMap((s) => s.enrolments.filter((e) => e.status === 'Enrolled' || e.status === 'Attended').map((e) => ({ s, staffId: e.staffId })))
        .filter(({ s, staffId }) => !trainingBonds.some((b) => b.staffId === staffId && b.sessionId === s.id)),
    [sessions, trainingBonds]
  );

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Training bonds</h3>
            <p>
              Courses over {kes(BOND_THRESHOLD)} per head are bonded. If the employee leaves early, the cost is recovered pro rata for the bonded months not yet served; Separation deducts it from final dues.
            </p>
          </div>
          <label className="req-field tr-asof">
            <span>If they leave on</span>
            <input type="date" className="form-control" value={exitOn} onChange={(ev) => setExitOn(ev.target.value || today)} />
          </label>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Course</th>
                <th className="num">Bond</th>
                <th>Bonded service</th>
                <th className="num">Recoverable</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {bonds.length === 0 && <Empty cols={7}>No training bonds.</Empty>}
              {bonds.map((b) => {
                const served = Math.min(b.months, monthsServed(b.startDate, exitOn));
                const owed = bondRecoveryFor(b.staffId, exitOn, [b]).owed;
                const ended = bondEnd(b) <= today;
                return (
                  <tr key={b.id} data-bond={b.id}>
                    <td>
                      <EmpCell e={byId.get(b.staffId)} id={b.staffId} sub={byId.get(b.staffId)?.department} />
                    </td>
                    <td>
                      <strong>{b.course}</strong>
                      <div className="muted">
                        {b.id}
                        {b.sessionId ? ` · ${b.sessionId}` : ''} · signed {fmtDate(b.signedOn)}
                      </div>
                    </td>
                    <td className="num">{kes(b.amount)}</td>
                    <td>
                      {fmtDate(b.startDate)} – {fmtDate(bondEnd(b))}
                      <div className="tr-bond-bar" aria-label={`${served} of ${b.months} months served`}>
                        <span style={{ width: `${(served / b.months) * 100}%` }} />
                      </div>
                      <div className="muted">
                        {served} of {b.months} months served by {fmtDate(exitOn)}
                      </div>
                    </td>
                    <td className="num">
                      <strong className={owed && b.status === 'Active' ? 'tr-neg' : undefined}>{b.status === 'Active' ? kes(owed) : '—'}</strong>
                    </td>
                    <td>
                      <Pill cls={STATUS_CLS[b.status]}>{b.status}</Pill>
                    </td>
                    <td>
                      {b.status === 'Active' && (
                        <div className="tm-actions">
                          {ended && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setBondStatus(b.id, 'Released')}>
                              Release
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => setBondStatus(b.id, 'Waived')}>
                            Waive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total recoverable if each bonded employee left on {fmtDate(exitOn)}</td>
                <td className="num">{kes(owedTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <h3 className="tm-h3">Bond needed</h3>
        {unbonded.length === 0 ? (
          <p className="pr-muted">Everyone booked on a bonded course has a signed bond.</p>
        ) : (
          <ul className="tr-alert-list">
            {unbonded.map(({ s, staffId }) => {
              const c = courseById(s.courseId)!;
              return (
                <li key={`${s.id}-${staffId}`}>
                  <Pill cls="warning">No bond</Pill>
                  <span>
                    <strong>{byId.get(staffId)?.fullName ?? staffId}</strong> · {c.title} ({s.id}, {kes(c.costPerHead)})
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDraft({ staffId, sessionId: s.id, course: c.title, amount: c.costPerHead, months: bondMonthsFor(c.costPerHead), startDate: s.end, signedOn: today < s.start ? today : s.start })}
                  >
                    <FileSignature size={13} /> Record bond
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {draft && (
        <Modal
          title="Training bond agreement"
          subtitle={`${byId.get(draft.staffId)?.fullName} · ${draft.course}`}
          onClose={() => setDraft(null)}
          width={560}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!(draft.amount > 0) || !(draft.months > 0) || !draft.startDate}
                onClick={() => {
                  addTrainingBond(draft);
                  setDraft(null);
                }}
              >
                Save signed bond
              </button>
            </>
          }
        >
          <div className="pr-form-grid">
            <label className="req-field">
              <span>Bond amount (KES)</span>
              <input type="number" min={0} className="form-control" value={draft.amount} onChange={(ev) => setDraft({ ...draft, amount: Number(ev.target.value) })} />
            </label>
            <label className="req-field">
              <span>Bonded months</span>
              <input type="number" min={1} className="form-control" value={draft.months} onChange={(ev) => setDraft({ ...draft, months: Number(ev.target.value) })} />
            </label>
            <label className="req-field">
              <span>Service starts</span>
              <input type="date" className="form-control" value={draft.startDate} onChange={(ev) => setDraft({ ...draft, startDate: ev.target.value })} />
            </label>
            <label className="req-field">
              <span>Signed on</span>
              <input type="date" className="form-control" value={draft.signedOn} max={today} onChange={(ev) => setDraft({ ...draft, signedOn: ev.target.value })} />
            </label>
          </div>
          <p className="pr-note">
            Leaving after {Math.floor(draft.months / 2)} months would mean repaying {kes(Math.round(draft.amount * (draft.months - Math.floor(draft.months / 2)) / Math.max(1, draft.months)))}.
          </p>
        </Modal>
      )}
    </>
  );
};
