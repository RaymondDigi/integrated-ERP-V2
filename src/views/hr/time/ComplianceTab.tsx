import React, { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { isCasual } from '../../../data/timeConfig';
import { S37, casualService, fmtDate, type CasualService } from '../../../data/timeEngine';
import type { HREmployee } from '../../../types';
import { EmpCell, Empty, NotTracked, Pill, useTimeOrg } from './shared';
import { STATE_CLS, STATE_LABEL } from './CasualDaysTab';

export const ComplianceTab: React.FC = () => {
  const { casualConversions, selectedOrgId } = useApp();
  const { staff, days, tracked, today, byId } = useTimeOrg();
  const [convert, setConvert] = useState<{ e: HREmployee; s: CasualService } | null>(null);
  const rows = useMemo(
    () =>
      staff
        .filter((e) => isCasual(e) && e.status !== 'TERMINATED')
        .map((e) => {
          const threshold = CONTRACT_TYPES.find((c) => c.name === e.contractType)?.serviceThresholdDays ?? S37.monthDays;
          return { e, threshold, s: casualService(e.staffId, days.filter((d) => d.staffId === e.staffId), today, threshold) };
        })
        .sort((a, b) => b.s.aggregateDays - a.s.aggregateDays),
    [staff, days, today]
  );
  const pg = usePaged(rows, 25);
  const converted = casualConversions.filter((c) => byId.get(c.staffId)?.orgId === selectedOrgId);
  if (!tracked) return <NotTracked />;
  const n = (k: CasualService['state']) => rows.filter((r) => r.s.state === k).length;

  return (
    <>
      <div className="guardrail-alert-card tm-s37">
        <div>
          <strong>Employment Act s.37: casual to term contract</strong>
          <p>
            A casual who works continuously for a month or more ({S37.monthDays} working days), or on work that runs three months or more ({S37.threeMonthsSpan} days), is deemed to be on monthly terms with the same protections as other employees. Days come from punches; a break longer than {S37.breakDays} days restarts the count.
          </p>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Convert terms now</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-critical)' }}>
            {n('CONVERT')}
          </div>
          <div className="hr-stat-subtext">Past the s.37 threshold</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Hold engagement</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-warning)' }}>
            {n('HOLD')}
          </div>
          <div className="hr-stat-subtext">Within 3 days of the threshold</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Watch</div>
          <div className="hr-stat-value">{n('WATCH')}</div>
          <div className="hr-stat-subtext">Supervisor alerted</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Converted</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-success)' }}>
            {converted.length}
          </div>
          <div className="hr-stat-subtext">This session</div>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Service threshold monitor</h3>
            <p>Daily-rated staff, from their join date and the days they punched in.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Joined</th>
                <th className="num">Last 30 / 60 days</th>
                <th>Continuous engagement</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={6}>No daily-rated staff left in this company.</Empty>}
              {pg.rows.map(({ e, s, threshold }) => (
                <tr key={e.staffId}>
                  <td>
                    <EmpCell e={e} id={e.staffId} sub={e.contractType} />
                  </td>
                  <td>{fmtDate(e.joinedDate)}</td>
                  <td className="num">
                    {s.daysLast30} / {s.daysLast60}
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <div className="tm-bar" aria-label={`${s.aggregateDays} of ${threshold} days`}>
                      <div className={`tm-bar-fill ${STATE_CLS[s.state]}`} style={{ width: `${Math.min(100, (s.aggregateDays / threshold) * 100)}%` }} />
                    </div>
                    <div className="muted">
                      {s.aggregateDays} of {threshold} days{s.engagedSince ? ` since ${fmtDate(s.engagedSince)} (${s.spanDays} calendar days)` : ''}
                    </div>
                  </td>
                  <td>
                    <Pill cls={STATE_CLS[s.state]}>{STATE_LABEL[s.state]}</Pill>
                    <div className="muted">{s.reason}</div>
                  </td>
                  <td>
                    <button className={`btn btn-xs ${s.state === 'CONVERT' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setConvert({ e, s })}>
                      <Zap size={12} /> Convert
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="workers" />
      </div>

      {converted.length > 0 && (
        <div className="pr-card">
          <h3 className="tm-h3">Converted this session</h3>
          <ul className="tm-rules">
            {converted.map((c) => (
              <li key={c.staffId + c.at}>
                <strong>{byId.get(c.staffId)?.fullName}</strong>: {c.from} → {c.to}, KES {c.basic.toLocaleString()} a month from {fmtDate(c.effective)} · {c.by} · {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {convert && <ConvertModal e={convert.e} s={convert.s} onClose={() => setConvert(null)} />}
    </>
  );
};

const ConvertModal: React.FC<{ e: HREmployee; s: CasualService; onClose: () => void }> = ({ e, s, onClose }) => {
  const { convertCasual, timeToday } = useApp();
  const targets = CONTRACT_TYPES.filter((c) => !c.serviceThresholdDays);
  const [type, setType] = useState(targets.find((c) => c.hasEndDate)?.name ?? targets[0]?.name ?? '');
  // Monthly equivalent of the daily rate over 26 working days
  const [basic, setBasic] = useState(String(Math.round(((e.payRateKes ?? 0) * 26) / 100) * 100));
  const [effective, setEffective] = useState(timeToday);
  const [reason, setReason] = useState(s.state === 'CONVERT' ? s.reason : 'Converted ahead of the threshold');
  return (
    <Modal
      title="Convert to monthly terms"
      subtitle={`${e.fullName} · ${e.staffId} · ${e.contractType} at KES ${(e.payRateKes ?? 0).toLocaleString()} a day`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!type || !(Number(basic) > 0)}
            onClick={() => {
              convertCasual(e.staffId, type, Number(basic), effective, reason.trim());
              onClose();
            }}
          >
            Convert
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>New contract type</span>
          <select className="form-control" value={type} onChange={(ev) => setType(ev.target.value)}>
            {targets.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Monthly basic (KES)</span>
          <input className="form-control" type="number" min={0} step={100} value={basic} onChange={(ev) => setBasic(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Effective from</span>
          <input className="form-control" type="date" value={effective} onChange={(ev) => setEffective(ev.target.value)} />
        </label>
        <label className="req-field wide">
          <span>Reason</span>
          <input className="form-control" value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </label>
      </div>
      <div className="pr-note">The employee master is updated at once; payroll treats the worker as salaried from the next run, with statutory deductions and leave accrual.</div>
    </Modal>
  );
};
