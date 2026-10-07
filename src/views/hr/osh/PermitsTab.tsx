import React, { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Play, Plus, ShieldCheck, Wind, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { PERMIT_TYPES, SAFETY_OFFICER } from '../../../data/oshConfig';
import { fmtDateTime, gasPass, nowLocal, permitBlockers, permitView, PERMIT_STATUS_LABEL, type PermitTypeId, type WorkPermit } from '../../../data/oshEngine';
import { Chips, Empty, Pill, StaffSelect, useOshOrg } from './shared';

const VIEW_CLS: Record<string, string> = { REQUESTED: 'warning', APPROVED: 'info', ACTIVE: 'primary', CLOSED: 'success', REJECTED: 'primary', EXPIRED: 'critical' };
const TYPE_IDS = Object.keys(PERMIT_TYPES) as PermitTypeId[];
const live = (p: WorkPermit) => ['REQUESTED', 'APPROVED', 'ACTIVE'].includes(p.status);

export const PermitsTab: React.FC = () => {
  const { workPermits, selectedOrgId } = useApp();
  const [filter, setFilter] = useState<'LIVE' | 'CLOSED' | 'ALL'>('LIVE');
  const [openId, setOpenId] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const now = nowLocal();
  const list = useMemo(() => workPermits.filter((p) => p.orgId === selectedOrgId), [workPermits, selectedOrgId]);
  const rows = useMemo(
    () => list.filter((p) => (filter === 'ALL' ? true : filter === 'LIVE' ? live(p) : !live(p))).sort((a, b) => b.validFrom.localeCompare(a.validFrom)),
    [list, filter]
  );
  const pg = usePaged(rows, 10, filter);
  const current = list.find((p) => p.id === openId);

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Permits to work</h3>
            <p>Hot work, confined space, work at height, electrical isolation (LOTO), boiler maintenance and chemical handling. Requested by the supervisor, approved by the safety officer, made active once site checks pass, closed after clearance.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setRaise(true)}>
            <Plus size={14} /> Request permit
          </button>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <Chips
            label="Permit filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'LIVE', label: 'Live', n: list.filter(live).length },
              { id: 'CLOSED', label: 'Closed / rejected', n: list.filter((p) => !live(p)).length },
              { id: 'ALL', label: 'All', n: list.length }
            ]}
          />
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Permit</th>
                <th>Work and location</th>
                <th>Holder</th>
                <th>Valid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={5}>No permits here.</Empty>}
              {pg.rows.map((p) => {
                const v = permitView(p, now);
                return (
                  <tr key={p.id} className="tm-click" onClick={() => setOpenId(p.id)}>
                    <td>
                      <strong className="tm-mono">{p.number}</strong>
                      <div className="muted">{PERMIT_TYPES[p.type].label}</div>
                    </td>
                    <td>
                      {p.work}
                      <div className="muted">{p.location}</div>
                    </td>
                    <td>{p.holder}</td>
                    <td className="tm-mono">
                      {fmtDateTime(p.validFrom)}
                      <div className="muted">to {fmtDateTime(p.validTo)}</div>
                    </td>
                    <td>
                      <Pill cls={VIEW_CLS[v]}>{PERMIT_STATUS_LABEL[v]}</Pill>
                      {p.approvedBy && <div className="muted">Approved by {p.approvedBy}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="permits" sizes={[10, 25]} />
      </div>
      {raise && <RequestPermitModal onClose={() => setRaise(false)} onDone={(id) => setOpenId(id)} />}
      {current && <PermitModal p={current} onClose={() => setOpenId(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */

const RequestPermitModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const { requestPermit } = useApp();
  const org = useOshOrg();
  const [type, setType] = useState<PermitTypeId>('HOT_WORK');
  const [location, setLocation] = useState('');
  const [work, setWork] = useState('');
  const [holderId, setHolderId] = useState('');
  const [contractor, setContractor] = useState('');
  const [from, setFrom] = useState(() => nowLocal(new Date(Date.now() + 3600_000)).slice(0, 14) + '00');
  const [to, setTo] = useState(() => nowLocal(new Date(Date.now() + 9 * 3600_000)).slice(0, 14) + '00');
  const [fireWatch, setFireWatch] = useState('');
  const [isoPoint, setIsoPoint] = useState('');
  const t = PERMIT_TYPES[type];
  const holder = holderId ? org.name(holderId) : contractor.trim();
  const submit = () => {
    const p = requestPermit({
      type,
      location,
      work,
      holder,
      holderStaffId: holderId || undefined,
      validFrom: from,
      validTo: to,
      requestedBy: 'Esther Muthoni',
      fireWatch: t.fireWatch ? (fireWatch ? org.name(fireWatch) : '') : undefined,
      isolations: t.isolation && isoPoint.trim() ? [{ point: isoPoint.trim(), lockNo: '', by: holder, verified: false }] : []
    });
    if (p) {
      onDone(p.id);
      onClose();
    }
  };
  return (
    <Modal
      title="Request a permit to work"
      subtitle={`Requested by Esther Muthoni (Operations Manager). ${SAFETY_OFFICER} approves.`}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!location.trim() || !work.trim() || !holder} onClick={submit}>
            Request permit
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Permit type</span>
          <select className="form-control" value={type} onChange={(ev) => setType(ev.target.value as PermitTypeId)}>
            {TYPE_IDS.map((k) => (
              <option key={k} value={k}>
                {PERMIT_TYPES[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Location</span>
          <input className="form-control" value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="e.g. Boiler No. 2 drum" />
        </label>
        <label className="req-field wide">
          <span>Work to be done</span>
          <input className="form-control" value={work} onChange={(ev) => setWork(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Permit holder (employee)</span>
          <StaffSelect value={holderId} onChange={setHolderId} staff={org.staff} allowEmpty="Contractor instead…" />
        </label>
        {!holderId && (
          <label className="req-field">
            <span>Contractor</span>
            <input className="form-control" value={contractor} onChange={(ev) => setContractor(ev.target.value)} placeholder="Company and lead person" />
          </label>
        )}
        <label className="req-field">
          <span>Valid from</span>
          <input className="form-control" type="datetime-local" value={from} onChange={(ev) => setFrom(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Valid to (max 12 hours)</span>
          <input className="form-control" type="datetime-local" value={to} onChange={(ev) => setTo(ev.target.value)} />
        </label>
        {t.fireWatch && (
          <label className="req-field">
            <span>Fire watch</span>
            <StaffSelect value={fireWatch} onChange={setFireWatch} staff={org.staff} allowEmpty="Choose…" />
          </label>
        )}
        {t.isolation && (
          <label className="req-field">
            <span>First isolation point</span>
            <input className="form-control" value={isoPoint} onChange={(ev) => setIsoPoint(ev.target.value)} placeholder="e.g. MCC-3 breaker 12" />
          </label>
        )}
      </div>
      <div className="pr-note">
        <strong>Precautions on this permit:</strong> {t.precautions.join(' · ')}
        {t.gasTest && ' · Gas test (O₂ 19.5–23.5%, LEL < 10%, H₂S < 10 ppm, CO < 25 ppm) before entry.'}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const PermitModal: React.FC<{ p: WorkPermit; onClose: () => void }> = ({ p, onClose }) => {
  const { approvePermit, rejectPermit, addGasTest, addIsolation, verifyIsolation, activatePermit, closeWorkPermit } = useApp();
  const now = nowLocal();
  const v = permitView(p, now);
  const t = PERMIT_TYPES[p.type];
  const [gas, setGas] = useState({ o2: 20.9, lel: 0, h2s: 0, co: 0 });
  const [iso, setIso] = useState({ point: '', lockNo: '' });
  const [note, setNote] = useState('');
  const [reject, setReject] = useState('');
  const blockers = permitBlockers(p, now);
  const checksEditable = p.status === 'REQUESTED' || p.status === 'APPROVED';

  return (
    <Modal
      title={`${p.number} · ${t.label}`}
      subtitle={`${p.location} · ${fmtDateTime(p.validFrom)} to ${fmtDateTime(p.validTo)}`}
      onClose={onClose}
      width={900}
      footer={
        <>
          {p.status === 'REQUESTED' && (
            <>
              <input className="form-control osh-footer-input" placeholder="Reason to reject" value={reject} onChange={(ev) => setReject(ev.target.value)} aria-label="Reason to reject" />
              <button className="btn btn-secondary" disabled={!reject.trim()} onClick={() => rejectPermit(p.id, reject)}>
                <XCircle size={14} /> Reject
              </button>
              <button className="btn btn-primary" onClick={() => approvePermit(p.id)}>
                <ShieldCheck size={14} /> Approve as safety officer
              </button>
            </>
          )}
          {p.status === 'APPROVED' && (
            <button className="btn btn-primary" onClick={() => activatePermit(p.id)}>
              <Play size={14} /> Start work (make active)
            </button>
          )}
          {p.status === 'ACTIVE' && (
            <button className="btn btn-primary" onClick={() => closeWorkPermit(p.id, note) && onClose()}>
              <CheckCircle2 size={14} /> Close out permit
            </button>
          )}
        </>
      }
    >
      <div className="pr-kv">
        <div>
          <span>Status</span>
          <div className="osh-kv-pill">
            <Pill cls={VIEW_CLS[v]}>{PERMIT_STATUS_LABEL[v]}</Pill>
          </div>
        </div>
        <div>
          <span>Holder</span>
          <strong style={{ fontSize: 13 }}>{p.holder}</strong>
          <small>Requested by {p.requestedBy}</small>
        </div>
        <div>
          <span>Approved</span>
          <strong style={{ fontSize: 13 }}>{p.approvedBy ?? '—'}</strong>
          <small>{p.approvedAt ? fmtDateTime(p.approvedAt) : 'Awaiting safety officer'}</small>
        </div>
        {p.fireWatch !== undefined && (
          <div>
            <span>Fire watch</span>
            <strong style={{ fontSize: 13 }}>{p.fireWatch || '—'}</strong>
          </div>
        )}
      </div>

      <section className="osh-sec">
        <h4>Work</h4>
        <p>{p.work}</p>
        <ul className="osh-checks">
          {p.precautions.map((x) => (
            <li key={x}>
              <CheckCircle2 size={13} /> {x}
            </li>
          ))}
        </ul>
        {p.rejectReason && <div className="pr-note bad">Rejected: {p.rejectReason}</div>}
        {p.closeNote && (
          <div className="pr-note">
            Closed {p.closedAt ? fmtDateTime(p.closedAt) : ''} by {p.closedBy}: {p.closeNote}
          </div>
        )}
      </section>

      {t.gasTest && (
        <section className="osh-sec">
          <h4>
            <Wind size={14} /> Gas tests
          </h4>
          {p.gasTests.length === 0 ? (
            <p className="pr-muted">No gas test yet. Test before entry and repeat after any break.</p>
          ) : (
            <div className="pr-table-scroll">
              <table className="hr-table pr-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th className="num">O₂ %</th>
                    <th className="num">LEL %</th>
                    <th className="num">H₂S ppm</th>
                    <th className="num">CO ppm</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {p.gasTests.map((g, k) => (
                    <tr key={k}>
                      <td className="tm-mono">
                        {fmtDateTime(g.at)}
                        <div className="muted">{g.by}</div>
                      </td>
                      <td className="num">{g.o2}</td>
                      <td className="num">{g.lel}</td>
                      <td className="num">{g.h2s}</td>
                      <td className="num">{g.co}</td>
                      <td>
                        <Pill cls={gasPass(g) ? 'success' : 'critical'}>{gasPass(g) ? 'Safe to enter' : 'Fail'}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(checksEditable || p.status === 'ACTIVE') && (
            <div className="osh-inline-form">
              {(['o2', 'lel', 'h2s', 'co'] as const).map((k) => (
                <label key={k} className="osh-mini">
                  <span>{k === 'o2' ? 'O₂ %' : k === 'lel' ? 'LEL %' : k === 'h2s' ? 'H₂S ppm' : 'CO ppm'}</span>
                  <input className="form-control" type="number" step="0.1" value={gas[k]} onChange={(ev) => setGas({ ...gas, [k]: Number(ev.target.value) })} />
                </label>
              ))}
              <button className="btn btn-secondary" onClick={() => addGasTest(p.id, { ...gas, by: SAFETY_OFFICER })}>
                Record gas test
              </button>
            </div>
          )}
        </section>
      )}

      {t.isolation && (
        <section className="osh-sec">
          <h4>
            <Lock size={14} /> Isolation points (lock out, tag out)
          </h4>
          {p.isolations.length === 0 && <p className="pr-muted">No isolation points recorded.</p>}
          <ul className="osh-list">
            {p.isolations.map((s, k) => (
              <li key={k}>
                <div>
                  <strong>{s.point}</strong>
                  <span className="pr-muted">
                    Lock {s.lockNo || '—'} · {s.by}
                  </span>
                </div>
                {checksEditable ? (
                  <label className="osh-check-row">
                    <input type="checkbox" checked={s.verified} onChange={() => verifyIsolation(p.id, k)} /> Locked and tested dead
                  </label>
                ) : (
                  <Pill cls={s.verified ? 'success' : 'warning'}>{s.verified ? 'Verified' : 'Not verified'}</Pill>
                )}
              </li>
            ))}
          </ul>
          {checksEditable && (
            <div className="osh-inline-form">
              <input className="form-control grow" placeholder="Isolation point" value={iso.point} onChange={(ev) => setIso({ ...iso, point: ev.target.value })} aria-label="Isolation point" />
              <input className="form-control" placeholder="Lock no." value={iso.lockNo} onChange={(ev) => setIso({ ...iso, lockNo: ev.target.value })} aria-label="Lock number" />
              <button
                className="btn btn-secondary"
                disabled={!iso.point.trim()}
                onClick={() => {
                  addIsolation(p.id, { point: iso.point.trim(), lockNo: iso.lockNo.trim(), by: p.holder });
                  setIso({ point: '', lockNo: '' });
                }}
              >
                Add point
              </button>
            </div>
          )}
        </section>
      )}

      {p.status === 'APPROVED' && blockers.length > 0 && <div className="pr-note warn">Before work starts: {blockers.join('; ')}.</div>}
      {p.status === 'ACTIVE' && (
        <label className="req-field">
          <span>Close-out note</span>
          <input className="form-control" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Site inspected, tools removed, locks removed, area handed back" />
        </label>
      )}
    </Modal>
  );
};
