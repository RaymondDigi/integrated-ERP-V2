import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileCheck, Plus, Receipt, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { IMPREST_KIND, overdueDays, receiptsTotal, SETTLEMENT, type Imprest, type ReceiptLine, type Settlement } from '../../../data/travelEngine';
import { Card, EmpCell, Empty, fmt, ImprestPill, kes, Modal, Pill } from './shared';

const blankLine = (date: string): ReceiptLine => ({ date, description: '', amount: 0, receiptNo: '' });

const SurrenderForm: React.FC<{ i: Imprest; onClose: () => void }> = ({ i, onClose }) => {
  const { surrenderImprest, travelToday, payrollOpenPeriod } = useApp();
  // A multi-line request starts with one receipt row per item, at the approved amount
  const [lines, setLines] = useState<ReceiptLine[]>(() => (i.lines?.length ? i.lines.filter((l) => (l.approved ?? l.amount) > 0).map((l) => ({ ...blankLine(travelToday), description: l.description, amount: l.approved ?? l.amount })) : [blankLine(travelToday)]));
  const [settlement, setSettlement] = useState<Settlement>('CASH_REFUND');
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const spent = receiptsTotal(lines);
  const variance = i.amount - spent;
  const setLine = (k: number, p: Partial<ReceiptLine>) => setLines((ls) => ls.map((l, j) => (j === k ? { ...l, ...p } : l)));
  // Keep the settlement choice valid for the direction of the variance
  const choice: Settlement =
    variance === 0
      ? 'NONE'
      : variance > 0
        ? ['CASH_REFUND', 'PAYROLL_RECOVERY'].includes(settlement)
          ? settlement
          : 'CASH_REFUND'
        : ['PAYROLL_REIMBURSE', 'CASH_REIMBURSE', 'NOT_REIMBURSED'].includes(settlement)
          ? settlement
          : 'PAYROLL_REIMBURSE';
  const opts: Settlement[] = variance > 0 ? ['CASH_REFUND', 'PAYROLL_RECOVERY'] : variance < 0 ? ['PAYROLL_REIMBURSE', 'CASH_REIMBURSE', 'NOT_REIMBURSED'] : [];
  const save = () => {
    const res = surrenderImprest(i.id, { lines, settlement: choice, overspendApproved: approved });
    if (!res.ok) return setError(res.reason ?? 'Could not save.');
    onClose();
  };
  const label = (s: Settlement) =>
    s === 'PAYROLL_RECOVERY'
      ? `Recover ${kes(variance)} through ${payrollOpenPeriod.label} payroll (other deduction)`
      : s === 'PAYROLL_REIMBURSE'
        ? `Reimburse ${kes(-variance)} through ${payrollOpenPeriod.label} payroll (tax-free)`
        : s === 'CASH_REFUND'
          ? `Employee refunds ${kes(variance)} in cash${i.paidFrom === 'FLOAT' ? ' (back into the float)' : ''}`
          : s === 'CASH_REIMBURSE'
            ? `Pay ${kes(-variance)} back in cash${i.paidFrom === 'FLOAT' ? ' from the float' : ''}`
            : SETTLEMENT[s];

  return (
    <Modal
      title={`Surrender ${i.id}`}
      subtitle={`${IMPREST_KIND[i.kind]} of ${kes(i.amount)} — ${i.purpose}`}
      onClose={onClose}
      width={880}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            <FileCheck size={15} /> Record surrender
          </button>
        </>
      }
    >
      <div className="hi-scroll">
        <table className="hr-table trv-lines">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Receipt no.</th>
              <th className="hi-num">Amount (KES)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, k) => (
              <tr key={k}>
                <td>
                  <input className="form-control" type="date" value={l.date} aria-label="Receipt date" onChange={(ev) => setLine(k, { date: ev.target.value })} />
                </td>
                <td>
                  <input className="form-control" value={l.description} placeholder="e.g. Hotel, 3 nights" aria-label="Description" onChange={(ev) => setLine(k, { description: ev.target.value })} />
                </td>
                <td>
                  <input className="form-control" value={l.receiptNo} placeholder="e.g. ETR-00412" aria-label="Receipt number" onChange={(ev) => setLine(k, { receiptNo: ev.target.value })} />
                </td>
                <td>
                  <input
                    className="form-control trv-num-input"
                    type="number"
                    min={0}
                    value={l.amount || ''}
                    aria-label="Amount"
                    onChange={(ev) => setLine(k, { amount: Number(ev.target.value) || 0 })}
                  />
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== k))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, blankLine(ls[ls.length - 1]?.date ?? travelToday)])}>
          <Plus size={13} /> Add receipt
        </button>
      </div>

      <div className="pr-kv">
        <div>
          <span>Advance</span>
          <strong>{kes(i.amount)}</strong>
        </div>
        <div>
          <span>Receipts</span>
          <strong>{kes(spent)}</strong>
        </div>
        <div>
          <span>{variance > 0 ? 'Unspent — employee owes' : variance < 0 ? 'Overspent — company owes' : 'Variance'}</span>
          <strong style={{ color: variance > 0 ? '#d97706' : variance < 0 ? 'var(--status-critical)' : '#059669' }}>{kes(Math.abs(variance))}</strong>
        </div>
      </div>

      {opts.length > 0 && (
        <div className="trv-settle">
          {opts.map((s) => (
            <label key={s}>
              <input type="radio" name="settle" checked={choice === s} onChange={() => setSettlement(s)} /> {label(s)}
            </label>
          ))}
          {variance < 0 && choice !== 'NOT_REIMBURSED' && (
            <label className="trv-approve">
              <input type="checkbox" checked={approved} onChange={(ev) => setApproved(ev.target.checked)} /> Finance has approved the overspend
            </label>
          )}
        </div>
      )}
      {error && <div className="pr-note bad">{error}</div>}
    </Modal>
  );
};

/** Advances waiting for receipts, overdue ones to recover, and past surrenders. */
export const SurrendersTab: React.FC = () => {
  const { imprests, travelToday, recoverImprestViaPayroll, payrollOpenPeriod, travelRequests, selectedOrgId } = useApp();
  const [surrenderId, setSurrenderId] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const pending = useMemo(
    () => imprests.filter((i) => i.status === 'PAID').sort((a, b) => overdueDays(b, travelToday) - overdueDays(a, travelToday) || (a.dueOn ?? '').localeCompare(b.dueOn ?? '')),
    [imprests, travelToday]
  );
  const done = useMemo(
    () => imprests.filter((i) => i.surrender || i.recovery).sort((a, b) => (b.surrender?.on ?? b.recovery?.on ?? '').localeCompare(a.surrender?.on ?? a.recovery?.on ?? '')),
    [imprests]
  );
  const pg = usePaged(done, 10, selectedOrgId);
  const surrendering = imprests.find((i) => i.id === surrenderId);
  const confirming = imprests.find((i) => i.id === confirmId);
  const tripOf = (i: Imprest) => travelRequests.find((r) => r.id === i.travelId);

  return (
    <>
      <Card title="Waiting for receipts" sub="Travel advances are due 7 days after return, petty cash in 3 days, imprest by the agreed date. Overdue balances can be recovered through payroll.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Employee</th>
                <th>For</th>
                <th className="hi-num">Advance</th>
                <th>Paid</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <Empty cols={7}>Everything has been surrendered.</Empty>}
              {pending.map((i) => {
                const late = overdueDays(i, travelToday);
                const trip = tripOf(i);
                return (
                  <tr key={i.id} className={late ? 'trv-overdue' : undefined}>
                    <td className="hi-mono">
                      {i.id}
                      <div className="hi-sub">{IMPREST_KIND[i.kind]}</div>
                    </td>
                    <td>
                      <EmpCell staffId={i.staffId} />
                    </td>
                    <td className="hi-wrap">
                      {trip ? `${trip.destinations} · ${trip.id}` : i.purpose}
                      {trip && <div className="hi-sub">Back {fmt(trip.returnDate)}</div>}
                    </td>
                    <td className="hi-num">{kes(i.amount)}</td>
                    <td className="hi-sub">{fmt(i.paidOn)}</td>
                    <td>
                      {fmt(i.dueOn)}
                      <div>
                        <ImprestPill i={i} today={travelToday} />
                      </div>
                    </td>
                    <td>
                      <div className="hi-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => setSurrenderId(i.id)}>
                          <Receipt size={13} /> Surrender
                        </button>
                        {late > 0 && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setConfirmId(i.id)}>
                            Recover through payroll
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Surrendered and settled" sub="Receipts against each advance and how the balance was settled.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Employee</th>
                <th>Receipts</th>
                <th className="hi-num">Advance</th>
                <th className="hi-num">Spent</th>
                <th className="hi-num">Variance</th>
                <th>Settlement</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No surrenders yet.</Empty>}
              {pg.rows.map((i) => {
                const s = i.surrender;
                return (
                  <tr key={i.id}>
                    <td className="hi-mono">
                      {i.id}
                      <div className="hi-sub">{i.travelId ?? IMPREST_KIND[i.kind]}</div>
                    </td>
                    <td>
                      <EmpCell staffId={i.staffId} />
                    </td>
                    <td className="hi-wrap">
                      {s ? (
                        s.lines.map((l, k) => (
                          <div key={k} className="hi-sub">
                            {fmt(l.date)} · {l.description} · {l.receiptNo} · {kes(l.amount)}
                          </div>
                        ))
                      ) : (
                        <span className="hi-sub">No receipts</span>
                      )}
                    </td>
                    <td className="hi-num">{kes(i.amount)}</td>
                    <td className="hi-num">{s ? kes(s.spent) : '—'}</td>
                    <td className="hi-num">{s ? (s.variance === 0 ? '—' : s.variance > 0 ? `${kes(s.variance)} unspent` : `${kes(-s.variance)} over`) : kes(i.amount)}</td>
                    <td className="hi-wrap">
                      {s ? (
                        <>
                          <Pill tone={s.settlement === 'NOT_REIMBURSED' ? 'warning' : 'success'}>{SETTLEMENT[s.settlement]}</Pill>
                          <div className="hi-sub">
                            {fmt(s.on)}
                            {s.payrollPeriod ? ` · payroll ${fmt(s.payrollPeriod)}` : ''}
                          </div>
                        </>
                      ) : i.recovery ? (
                        <>
                          <Pill tone="warning">Recovered via payroll</Pill>
                          <div className="hi-sub">
                            {fmt(i.recovery.on)} · payroll {fmt(i.recovery.period)}
                          </div>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="surrenders" sizes={[10, 25, 50]} />
      </Card>

      {surrendering && <SurrenderForm i={surrendering} onClose={() => setSurrenderId('')} />}
      {confirming && (
        <Modal
          title={`Recover ${confirming.id} through payroll`}
          onClose={() => setConfirmId('')}
          width={560}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmId('')}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  recoverImprestViaPayroll(confirming.id);
                  setConfirmId('');
                }}
              >
                Post deduction
              </button>
            </>
          }
        >
          <div className="pr-note warn">
            <AlertTriangle size={13} /> {kes(confirming.amount)} is {overdueDays(confirming, travelToday)} days past its surrender date. This posts an “Other deduction” of {kes(confirming.amount)} to
            the {payrollOpenPeriod.label} payroll with the note “Imprest recovery {confirming.travelId ?? confirming.id}”, and closes the advance.
          </div>
        </Modal>
      )}
    </>
  );
};
