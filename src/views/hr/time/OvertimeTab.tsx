import React, { useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { componentAt } from '../../../data/payComponents';
import { TIME_RULES, isCasual } from '../../../data/timeConfig';
import { formulaVars } from '../../../data/payrollEngine';
import { exKey, fmtDate, OT_COMPONENT, otAmount } from '../../../data/timeEngine';
import { EmpCell, Empty, NotTracked, Pill, useTimeOrg } from './shared';
import { usePeriods } from './TimesheetsTab';

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
  casual: boolean;
}

const kes = (n: number) => Math.round(n).toLocaleString();

export const OvertimeTab: React.FC = () => {
  const { timeDecisions, overtimeSent, payrollOpenPeriod, sendOvertimeToPayroll, setCurrentView, setModuleTab } = useApp();
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
      const l = m.get(d.staffId) ?? { staffId: d.staffId, days: 0, pending: 0, rejected: 0, ready15: 0, ready20: 0, readyKeys: [], sent15: 0, sent20: 0, casual: d.casual };
      l.days++;
      if (!dec) l.pending += d.ot15 + d.ot20;
      else if (dec.status === 'REJECTED') l.rejected += d.ot15 + d.ot20;
      else if (dec.status === 'APPROVED') {
        const sent = overtimeSent[k];
        if (sent) {
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
                    ) : l.sent15 + l.sent20 ? (
                      <Pill cls="success">Sent {l.sent15 + l.sent20} h</Pill>
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
      <p className="pr-muted" style={{ marginTop: 8 }}>
        Weekday overtime counts from {TIME_RULES.otThresholdMin} minutes past the shift end, in half hours. Saturday work is 1.5×; Sundays and public holidays are 2× ({c20.calc?.method === 'rate' ? `${c20.calc.multiplier}× hourly` : 'per pay item'}). Hours already sent are never sent twice; cancel the payroll item if hours change. Rejected hours: {lines.reduce((n, l) => n + l.rejected, 0)}. Period {fmtDate(period.from)} to {fmtDate(period.to)}.
      </p>
    </div>
  );
};
