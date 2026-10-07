import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Stethoscope } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { WIBA_INSURER, WIBA_POLICY } from '../../../data/oshConfig';
import {
  BASIS_LABEL,
  CLAIM_LABEL,
  CLAIM_STEPS,
  lostDaysOf,
  TTD_MAX_DAYS,
  WIBA_MONTHS,
  wibaEarnings,
  wibaEstimate,
  type ClaimBasis,
  type ClaimStatus,
  type OshIncident,
  type WibaClaim
} from '../../../data/oshEngine';
import { EmpCell, Empty, fmt, kes, Pill, useOshOrg } from './shared';

const CLAIM_CLS: Record<ClaimStatus, string> = { NOTIFIED: 'warning', ASSESSED: 'info', APPROVED: 'primary', PAID: 'success' };

export const WibaTab: React.FC = () => {
  const { wibaClaims, oshIncidents, selectedOrgId, moduleTabs, setModuleTab } = useApp();
  const org = useOshOrg();
  const [openId, setOpenId] = useState<string | null>(null);
  const [raiseFor, setRaiseFor] = useState<OshIncident | null>(null);
  const claims = useMemo(() => wibaClaims.filter((c) => c.orgId === selectedOrgId).sort((a, b) => b.notifiedOn.localeCompare(a.notifiedOn)), [wibaClaims, selectedOrgId]);
  const pending = oshIncidents.filter((i) => i.orgId === selectedOrgId && i.staffId && (i.kind === 'INJURY' || i.kind === 'OCCUPATIONAL_DISEASE') && i.severity !== 'FIRST_AID' && !wibaClaims.some((c) => c.incidentId === i.id));
  const pg = usePaged(claims, 10);

  const focus = moduleTabs['osh-claim'];
  useEffect(() => {
    if (focus) {
      setOpenId(focus);
      setModuleTab('osh-claim', '');
    }
  }, [focus, setModuleTab]);

  const open = claims.filter((c) => c.status !== 'PAID');
  const estimateOpen = open.reduce((a, c) => a + (c.assessedKes ?? wibaEstimate(c).total), 0);
  const paid = claims.filter((c) => c.status === 'PAID').reduce((a, c) => a + (c.paidKes ?? 0), 0);
  const current = claims.find((c) => c.id === openId);

  return (
    <>
      <div className="pr-kv osh-kv-gap">
        <div>
          <span>Open claims</span>
          <strong>{open.length}</strong>
          <small>{kes(estimateOpen)} estimated</small>
        </div>
        <div>
          <span>Paid this year</span>
          <strong>{kes(paid)}</strong>
          <small>{claims.filter((c) => c.status === 'PAID').length} claims</small>
        </div>
        <div>
          <span>Insurer</span>
          <strong style={{ fontSize: 13 }}>{WIBA_INSURER}</strong>
          <small>Policy {WIBA_POLICY}</small>
        </div>
        <div>
          <span>Injuries without a claim</span>
          <strong>{pending.length}</strong>
          <small>Medical treatment or worse</small>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Injuries to notify to the insurer</h3>
              <p>WIBA 2007 s.21: the employer reports to the insurer and DOSHS within 7 days. Wages continue in full while the employee is off on the injury.</p>
            </div>
          </div>
          <ul className="osh-list">
            {pending.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>
                    {i.id} · {org.name(i.staffId)}
                  </strong>
                  <span className="pr-muted">
                    {fmt(i.occurredOn)} · {i.injuryNature} ({i.bodyPart}) · {lostDaysOf(i, org.today)} day(s) lost
                  </span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setRaiseFor(i)}>
                  <Stethoscope size={13} /> Raise claim
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>WIBA claims</h3>
            <p>Estimates use the employee's monthly earnings from payroll in the month before the accident.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Employee</th>
                <th>Basis</th>
                <th className="num">Estimate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={5}>No WIBA claims.</Empty>}
              {pg.rows.map((c) => (
                <tr key={c.id} className="tm-click" onClick={() => setOpenId(c.id)}>
                  <td>
                    <strong>{c.id}</strong>
                    <div className="muted">
                      {c.incidentId} · notified {fmt(c.notifiedOn)}
                    </div>
                  </td>
                  <td>
                    <EmpCell e={org.byId.get(c.staffId)} id={c.staffId} />
                  </td>
                  <td>
                    {BASIS_LABEL[c.basis]}
                    <div className="muted">
                      {c.ttdDays} day(s){c.basis === 'PERMANENT' ? ` · ${c.ppdPercent}%` : ''}
                    </div>
                  </td>
                  <td className="num">{kes(c.paidKes ?? c.assessedKes ?? wibaEstimate(c).total)}</td>
                  <td>
                    <Pill cls={CLAIM_CLS[c.status]}>{CLAIM_LABEL[c.status]}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="claims" sizes={[10, 25]} />
      </div>

      {raiseFor && <RaiseClaimModal incident={raiseFor} onClose={() => setRaiseFor(null)} onDone={(id) => setOpenId(id)} />}
      {current && <ClaimModal c={current} onClose={() => setOpenId(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */

const Breakdown: React.FC<{ c: Pick<WibaClaim, 'basis' | 'monthlyEarnings' | 'ttdDays' | 'ppdPercent' | 'medicalKes' | 'funeralKes'> }> = ({ c }) => {
  const est = wibaEstimate(c);
  return (
    <table className="hr-table pr-table osh-calc">
      <tbody>
        {c.basis !== 'DEATH' && (
          <tr>
            <td>
              Temporary total disablement
              <div className="muted">
                {kes(est.daily)}/day (full earnings ÷ 30) × {est.days} day(s){c.ttdDays > TTD_MAX_DAYS ? ' (capped at 12 months)' : ''}
                {c.ttdDays <= 3 ? ' — not payable for 3 days or less' : ''}
              </div>
            </td>
            <td className="num">{kes(est.ttd)}</td>
          </tr>
        )}
        {c.basis === 'PERMANENT' && (
          <tr>
            <td>
              Permanent disablement
              <div className="muted">
                {c.ppdPercent}% × {WIBA_MONTHS} months × {kes(c.monthlyEarnings)}
              </div>
            </td>
            <td className="num">{kes(est.ppd)}</td>
          </tr>
        )}
        {c.basis === 'DEATH' && (
          <>
            <tr>
              <td>
                Death benefit to dependants
                <div className="muted">
                  {WIBA_MONTHS} months × {kes(c.monthlyEarnings)}
                </div>
              </td>
              <td className="num">{kes(est.death)}</td>
            </tr>
            <tr>
              <td>Funeral expenses</td>
              <td className="num">{kes(est.funeral)}</td>
            </tr>
          </>
        )}
        <tr>
          <td>Reasonable medical expenses</td>
          <td className="num">{kes(est.medical)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>Estimated compensation</td>
          <td className="num">{kes(est.total)}</td>
        </tr>
      </tfoot>
    </table>
  );
};

const Earnings: React.FC<{ staffId: string; on: string }> = ({ staffId, on }) => {
  const { payrollCtx } = useApp();
  const org = useOshOrg();
  const e = org.byId.get(staffId);
  if (!e) return null;
  const earn = wibaEarnings(e, on, payrollCtx);
  const other = earn.amount - earn.basic - earn.house - earn.transport - earn.overtime;
  return (
    <div className="pr-note">
      <strong>Monthly earnings {kes(earn.amount)}</strong> — {earn.period} payslip
      {earn.casual ? ` (daily-rated, ${earn.daysWorked} days worked)` : `: basic ${kes(earn.basic)}, house ${kes(earn.house)}, transport ${kes(earn.transport)}${earn.overtime ? `, overtime ${kes(earn.overtime)}` : ''}${other > 0 ? `, other earnings ${kes(other)}` : ''}`}.
    </div>
  );
};

export const RaiseClaimModal: React.FC<{ incident: OshIncident; onClose: () => void; onDone?: (id: string) => void }> = ({ incident, onClose, onDone }) => {
  const { raiseWibaClaim, payrollCtx } = useApp();
  const org = useOshOrg();
  const e = org.byId.get(incident.staffId ?? '');
  const [basis, setBasis] = useState<ClaimBasis>(incident.severity === 'FATAL' ? 'DEATH' : incident.severity === 'PERMANENT' ? 'PERMANENT' : 'TEMPORARY');
  const [ppd, setPpd] = useState(incident.severity === 'PERMANENT' ? 10 : 0);
  const [medical, setMedical] = useState(0);
  const [funeral, setFuneral] = useState(0);
  const earnings = e ? wibaEarnings(e, incident.occurredOn, payrollCtx).amount : 0;
  const ttdDays = lostDaysOf(incident, org.today);
  const submit = () => {
    const c = raiseWibaClaim(incident.id, basis, ppd, medical, funeral);
    if (c) {
      onDone?.(c.id);
      onClose();
    }
  };
  return (
    <Modal
      title={`WIBA claim · ${e?.fullName ?? incident.staffId}`}
      subtitle={`${incident.id} · ${fmt(incident.occurredOn)} · ${incident.injuryNature ?? ''} ${incident.bodyPart ? `(${incident.bodyPart})` : ''}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            <Stethoscope size={14} /> Notify insurer
          </button>
        </>
      }
    >
      <Earnings staffId={incident.staffId ?? ''} on={incident.occurredOn} />
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Basis</span>
          <select className="form-control" value={basis} onChange={(ev) => setBasis(ev.target.value as ClaimBasis)}>
            {(Object.keys(BASIS_LABEL) as ClaimBasis[]).map((b) => (
              <option key={b} value={b}>
                {BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
        {basis === 'PERMANENT' && (
          <label className="req-field">
            <span>Degree of permanent disablement (%)</span>
            <input className="form-control" type="number" min={0} max={100} value={ppd} onChange={(ev) => setPpd(Math.max(0, Math.min(100, Number(ev.target.value))))} />
          </label>
        )}
        <label className="req-field">
          <span>Medical expenses (KES)</span>
          <input className="form-control" type="number" min={0} value={medical} onChange={(ev) => setMedical(Math.max(0, Number(ev.target.value)))} />
        </label>
        {basis === 'DEATH' && (
          <label className="req-field">
            <span>Funeral expenses (KES)</span>
            <input className="form-control" type="number" min={0} value={funeral} onChange={(ev) => setFuneral(Math.max(0, Number(ev.target.value)))} />
          </label>
        )}
      </div>
      <Breakdown c={{ basis, monthlyEarnings: earnings, ttdDays, ppdPercent: ppd, medicalKes: medical, funeralKes: funeral }} />
      <p className="pr-muted">Lost days so far: {ttdDays}{incident.returnedOn ? '' : ' and counting'}. Pay is not reduced while off on injury: the company pays full wages and recovers them from the insurer.</p>
    </Modal>
  );
};

const ClaimModal: React.FC<{ c: WibaClaim; onClose: () => void }> = ({ c, onClose }) => {
  const { advanceWibaClaim, updateWibaClaim, oshIncidents, setModuleTab } = useApp();
  const org = useOshOrg();
  const inc = oshIncidents.find((i) => i.id === c.incidentId);
  const est = wibaEstimate(c).total;
  const [amount, setAmount] = useState<number>(c.assessedKes ?? est);
  const idx = CLAIM_STEPS.indexOf(c.status);
  const next = CLAIM_STEPS[idx + 1];
  return (
    <Modal
      title={`${c.id} · ${org.name(c.staffId)}`}
      subtitle={`${c.insurer} · policy ${c.policyNo} · notified ${fmt(c.notifiedOn)}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          {inc && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setModuleTab('osh-incident', inc.id);
                setModuleTab('osh-security', 'incidents');
                onClose();
              }}
            >
              Open incident {inc.id}
            </button>
          )}
          {next && (
            <button className="btn btn-primary" onClick={() => advanceWibaClaim(c.id, next === 'APPROVED' ? undefined : amount)}>
              Mark {CLAIM_LABEL[next].toLowerCase()} <ChevronRight size={14} />
            </button>
          )}
        </>
      }
    >
      <ol className="tm-stepper" aria-label="Claim stages">
        {CLAIM_STEPS.map((s, k) => (
          <li key={s} className={k < idx || c.status === 'PAID' ? 'done' : k === idx ? 'current' : ''}>
            <span>{CLAIM_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      <Earnings staffId={c.staffId} on={inc?.occurredOn ?? c.notifiedOn} />
      {c.status === 'NOTIFIED' && (
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Days of temporary disablement</span>
            <input className="form-control" type="number" min={0} value={c.ttdDays} onChange={(ev) => updateWibaClaim(c.id, { ttdDays: Math.max(0, Number(ev.target.value)) })} />
          </label>
          <label className="req-field">
            <span>Medical expenses (KES)</span>
            <input className="form-control" type="number" min={0} value={c.medicalKes} onChange={(ev) => updateWibaClaim(c.id, { medicalKes: Math.max(0, Number(ev.target.value)) })} />
          </label>
          {c.basis === 'PERMANENT' && (
            <label className="req-field">
              <span>Permanent disablement (%)</span>
              <input className="form-control" type="number" min={0} max={100} value={c.ppdPercent} onChange={(ev) => updateWibaClaim(c.id, { ppdPercent: Math.max(0, Math.min(100, Number(ev.target.value))) })} />
            </label>
          )}
        </div>
      )}
      <Breakdown c={c} />
      {(next === 'ASSESSED' || next === 'PAID') && (
        <label className="req-field">
          <span>{next === 'ASSESSED' ? 'Amount assessed by the insurer (KES)' : 'Amount paid (KES)'}</span>
          <input className="form-control" type="number" min={0} value={amount} onChange={(ev) => setAmount(Math.max(0, Number(ev.target.value)))} />
        </label>
      )}
      {c.assessedKes !== undefined && (
        <p className="pr-muted">
          Assessed {kes(c.assessedKes)}
          {c.paidKes !== undefined ? ` · paid ${kes(c.paidKes)} on ${fmt(c.paidOn)}` : ''}
        </p>
      )}
      <ul className="osh-history">
        {c.history.map((h, k) => (
          <li key={k}>
            <span>{fmt(h.at)}</span> {h.text} — {h.by}
          </li>
        ))}
      </ul>
    </Modal>
  );
};
