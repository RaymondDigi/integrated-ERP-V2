import React, { useMemo, useState } from 'react';
import { PiggyBank, Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { componentAt } from '../../../data/payComponents';
import { TIME_RULES, isCasual } from '../../../data/timeConfig';
import { formulaVars } from '../../../data/payrollEngine';
import { exKey, fmtDate, OT_COMPONENT, otAmount } from '../../../data/timeEngine';
import { EmpCell, Empty, NotTracked, Pill, useTimeOrg } from './shared';
import { usePeriods } from './TimesheetsTab';
import { Modal } from '../payroll/shared';
import { FLEXI_DAY_HOURS, FLEXI_USE_WITHIN_DAYS, flexiBalance, type FlexiEntry } from '../../../context/timeState';
import type { HREmployee } from '../../../types';

interface Line {
  staffId: string;
  days: number;
  pending: number;
  rejected: number;
  ready15: number;
  ready20: number;
  readyKeys: string[];
  sent15: number;
  sent20: number;
  /** Hours banked as flexi time instead of paid */
  banked: number;
  casual: boolean;
}

const kes = (n: number) => Math.round(n).toLocaleString();

export const OvertimeTab: React.FC = () => {
  const { timeDecisions, overtimeSent, payrollOpenPeriod, sendOvertimeToPayroll, bankOvertimeAsFlexi, flexiLedger, setCurrentView, setModuleTab } = useApp();
  const [booking, setBooking] = useState<string | null>(null);
  const { byId, days, tracked } = useTimeOrg();
  const periods = usePeriods().filter((p) => p.id.startsWith('M:'));
  const [pid, setPid] = useState(`M:${payrollOpenPeriod.key}`);
  const period = periods.find((p) => p.id === pid) ?? periods[0];
  const open = { ...payrollOpenPeriod };

  const lines = useMemo(() => {
    const m = new Map<string, Line>();
    for (const d of days) {
      if (d.date < period.from || d.date > period.to || d.ot15 + d.ot20 === 0) continue;
      const k = exKey('OVERTIME', d.staffId, d.date);
      const dec = timeDecisions[k];
      const l = m.get(d.staffId) ?? { staffId: d.staffId, days: 0, pending: 0, rejected: 0, ready15: 0, ready20: 0, readyKeys: [], sent15: 0, sent20: 0, banked: 0, casual: d.casual };
      l.days++;
      if (!dec) l.pending += d.ot15 + d.ot20;
      else if (dec.status === 'REJECTED') l.rejected += d.ot15 + d.ot20;
      else if (dec.status === 'APPROVED') {
        const sent = overtimeSent[k];
        if (sent?.period === 'FLEXI') l.banked += sent.h15 + sent.h20;
        else if (sent) {
          l.sent15 += sent.h15;
          l.sent20 += sent.h20;
        } else {
          l.ready15 += dec.h15 ?? 0;
          l.ready20 += dec.h20 ?? 0;
          l.readyKeys.push(k);
        }
      }
      m.set(d.staffId, l);
    }
    return [...m.values()].sort((a, b) => b.ready15 + b.ready20 - (a.ready15 + a.ready20) || a.staffId.localeCompare(b.staffId));
  }, [days, period, timeDecisions, overtimeSent]);
  const pg = usePaged(lines, 25, pid);

  if (!tracked) return <NotTracked />;

  const preview = (l: Line) => {
    const e = byId.get(l.staffId);
    if (!e || isCasual(e)) return { a15: 0, a20: 0 };
    return { a15: otAmount(e, open, OT_COMPONENT.h15, l.ready15), a20: otAmount(e, open, OT_COMPONENT.h20, l.ready20) };
  };
  const sendable = lines.filter((l) => !l.casual && l.readyKeys.length);
  const totals = sendable.reduce(
    (t, l) => {
      const p = preview(l);
      return { h: t.h + l.ready15 + l.ready20, amt: t.amt + p.a15 + p.a20 };
    },
    { h: 0, amt: 0 }
  );
  const pending = lines.reduce((n, l) => n + l.pending, 0);
  const c15 = componentAt(OT_COMPONENT.h15, open.key);
  const c20 = componentAt(OT_COMPONENT.h20, open.key);

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Overtime for payroll</h3>
          <p>
            Approved hours go to the {open.label} payroll as “{c15.name}” (1.5×) and “{c20.name}” (2×). Payroll works out the amount from the hourly rate; the figures here are a preview.
          </p>
        </div>
        <div className="pr-toolbar">
          <select className="form-control" aria-label="Timesheet month" value={pid} onChange={(ev) => setPid(ev.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!sendable.length}
            onClick={() => sendOvertimeToPayroll(sendable.flatMap((l) => l.readyKeys))}
            title={sendable.length ? `Post to ${open.label}` : 'Nothing approved and unsent'}
          >
            <Send size={14} /> Send to payroll
          </button>
          <button
            className="btn btn-secondary"
            disabled={!sendable.length}
            onClick={() => bankOvertimeAsFlexi(sendable.flatMap((l) => l.readyKeys))}
            title="Give time off later instead of paying: 1.5× hours bank at 1.5, 2× hours at 2"
          >
            <PiggyBank size={14} /> Bank as flexi hours
          </button>
        </div>
      </div>
      <div className="pr-kv" style={{ marginBottom: 14 }}>
        <div>
          <span>Ready to send</span>
          <strong>{totals.h} h</strong>
          <small>
            {sendable.length} staff · about KES {kes(totals.amt)}
          </small>
        </div>
        <div>
          <span>Waiting for approval</span>
          <strong>{pending} h</strong>
          <small>
            <button className="tm-link" onClick={() => setModuleTab('attendance', 'exceptions')}>
              Review in the exceptions queue
            </button>
          </small>
        </div>
        <div>
          <span>Already sent or paid</span>
          <strong>{lines.reduce((n, l) => n + l.sent15 + l.sent20, 0)} h</strong>
          <small>
            <button className="tm-link" onClick={() => (setModuleTab('payroll', 'items'), setCurrentView('payroll'))}>
              Open payroll items
            </button>
          </small>
        </div>
      </div>
      {period.to < `${open.key}-01` && <div className="pr-note warn" style={{ marginBottom: 12 }}>{period.label} has been paid. Overtime approved late is paid as arrears in {open.label}.</div>}
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">OT days</th>
              <th className="num">Pending</th>
              <th className="num">Approved 1.5×</th>
              <th className="num">Approved 2×</th>
              <th className="num">Preview (KES)</th>
              <th>Payroll</th>
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={7}>No overtime worked in {period.label}.</Empty>}
            {pg.rows.map((l) => {
              const e = byId.get(l.staffId);
              const p = preview(l);
              return (
                <tr key={l.staffId}>
                  <td>
                    <EmpCell e={e} id={l.staffId} sub={e?.department} />
                  </td>
                  <td className="num">{l.days}</td>
                  <td className="num">{l.pending ? `${l.pending} h` : '—'}</td>
                  <td className="num">{l.ready15 ? `${l.ready15} h` : '—'}</td>
                  <td className="num">{l.ready20 ? `${l.ready20} h` : '—'}</td>
                  <td className="num">
                    {l.casual ? '—' : p.a15 + p.a20 ? kes(p.a15 + p.a20) : '—'}
                    {!l.casual && (p.a15 || p.a20) ? <div className="muted">hourly KES {kes(formulaVars(e!, open.year, open.month).HOURLY)}</div> : null}
                  </td>
                  <td>
                    {l.casual ? (
                      <Pill cls="primary">Paid by days worked</Pill>
                    ) : l.readyKeys.length ? (
                      <Pill cls="warning">Ready to send</Pill>
                    ) : l.sent15 + l.sent20 || l.banked ? (
                      <>
                        {l.sent15 + l.sent20 > 0 && <Pill cls="success">Sent {l.sent15 + l.sent20} h</Pill>} {l.banked > 0 && <Pill cls="primary">Banked {l.banked} h as flexi</Pill>}
                      </>
                    ) : l.pending ? (
                      <Pill cls="primary">Awaiting approval</Pill>
                    ) : (
                      <Pill cls="primary">Nothing to send</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="staff" />
      <FlexiBalances byId={byId} onBook={setBooking} ledger={flexiLedger} />
      {booking && <BookFlexi staffId={booking} name={byId.get(booking)?.fullName ?? booking} onClose={() => setBooking(null)} />}
      <p className="pr-muted" style={{ marginTop: 8 }}>
        Weekday overtime counts from {TIME_RULES.otThresholdMin} minutes past the shift end, in half hours. Saturday work is 1.5×; Sundays and public holidays are 2× ({c20.calc?.method === 'rate' ? `${c20.calc.multiplier}× hourly` : 'per pay item'}). Hours already sent are never sent twice; cancel the payroll item if hours change. Rejected hours: {lines.reduce((n, l) => n + l.rejected, 0)}. Period {fmtDate(period.from)} to {fmtDate(period.to)}.
      </p>
    </div>
  );
};

/** Banked flexi hours per employee, with days taken against them. */
const FlexiBalances: React.FC<{ byId: Map<string, HREmployee>; ledger: FlexiEntry[]; onBook: (staffId: string) => void }> = ({ byId, ledger, onBook }) => {
  const staff = [...new Set(ledger.map((f) => f.staffId))].filter((id) => byId.has(id));
  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ margin: '0 0 6px' }}>Flexi days</h4>
      <p className="pr-muted" style={{ margin: '0 0 10px' }}>
        Overtime banked instead of paid is taken later as days off ({FLEXI_DAY_HOURS} h a day), within {FLEXI_USE_WITHIN_DAYS} days. A flexi day is an authorised absence, so it never reduces pay.
      </p>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">Banked</th>
              <th className="num">Taken</th>
              <th className="num">Balance</th>
              <th>Use by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && <Empty cols={6}>No flexi hours banked yet. Choose “Bank as flexi hours” above instead of sending overtime to payroll.</Empty>}
            {staff.map((id) => {
              const mine = ledger.filter((f) => f.staffId === id);
              const banked = mine.filter((f) => f.kind === 'BANKED');
              const bal = flexiBalance(ledger, id);
              const useBy = banked.map((f) => f.useBy ?? '').sort()[0];
              return (
                <tr key={id}>
                  <td>
                    <EmpCell e={byId.get(id)} id={id} sub={byId.get(id)?.department} />
                  </td>
                  <td className="num">{banked.reduce((s, f) => s + f.hours, 0)} h</td>
                  <td className="num">{-mine.filter((f) => f.kind === 'TAKEN').reduce((s, f) => s + f.hours, 0)} h</td>
                  <td className="num">
                    <strong>{bal} h</strong>
                    <div className="muted">{Math.floor(bal / FLEXI_DAY_HOURS)} day{Math.floor(bal / FLEXI_DAY_HOURS) === 1 ? '' : 's'}</div>
                  </td>
                  <td>{useBy ? fmtDate(useBy) : '—'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" disabled={bal < FLEXI_DAY_HOURS} onClick={() => onBook(id)}>
                      Book flexi day
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Books one or more consecutive working days off against the flexi balance. */
const BookFlexi: React.FC<{ staffId: string; name: string; onClose: () => void }> = ({ staffId, name, onClose }) => {
  const { takeFlexiDays, flexiLedger, timeToday } = useApp();
  const [from, setFrom] = useState(timeToday);
  const [count, setCount] = useState(1);
  const [reason, setReason] = useState('');
  const bal = flexiBalance(flexiLedger, staffId);
  const max = Math.floor(bal / FLEXI_DAY_HOURS);
  // Working days (Mon–Fri) from the start date
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00`); dates.length < count && from; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return (
    <Modal
      title={`Book flexi day · ${name}`}
      subtitle={`${bal} h banked — up to ${max} day${max === 1 ? '' : 's'}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!from || count < 1 || count > max} onClick={() => takeFlexiDays(staffId, dates, reason.trim()) && onClose()}>
            Book {count} day{count === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>First day off</span>
          <input className="form-control" type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Working days</span>
          <input className="form-control" type="number" min={1} max={max} value={count} onChange={(ev) => setCount(Math.max(1, Number(ev.target.value) || 1))} />
        </label>
        <label className="req-field wide">
          <span>Reason (optional)</span>
          <input className="form-control" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Time off after the September audit weekends" />
        </label>
      </div>
      <p className="pr-muted" style={{ marginTop: 10 }}>
        Days: {dates.map((d) => fmtDate(d)).join(', ') || '—'} · uses {count * FLEXI_DAY_HOURS} h
      </p>
    </Modal>
  );
};
