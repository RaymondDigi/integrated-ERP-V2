import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FilePlus2, ListPlus, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { CERTIFICATIONS, ROLE_RULES, certById, type TrainingNeed } from '../../../data/trainingConfig';
import { heatmap, isGap, matrixCsv, type MatrixCell } from '../../../data/trainingEngine';
import { fmtDate } from '../../../data/timeEngine';
import { CertPill, Chips, downloadCsv, EmpCell, Empty, Pill, useTrainingOrg } from './shared';

type Show = 'ALL' | 'GAPS' | 'DUE' | 'VALID';

const heatCls = (pct: number) => (pct >= 90 ? 'good' : pct >= 70 ? 'warn' : 'bad');

export const MatrixTab: React.FC = () => {
  const { raiseGapNeeds, recordCertificate, trainingNeeds, activeTenant } = useApp();
  const { matrix, byId, today } = useTrainingOrg();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [cert, setCert] = useState('');
  const [show, setShow] = useState<Show>('ALL');
  const [picked, setPicked] = useState<string[]>([]);
  const [recording, setRecording] = useState<MatrixCell | null>(null);
  const [issued, setIssued] = useState(today);
  const [ref, setRef] = useState('');

  const openNeed = useMemo(() => {
    const m = new Map<string, TrainingNeed>();
    for (const n of trainingNeeds) if (n.certId && (n.status === 'Proposed' || n.status === 'Approved' || n.status === 'Planned')) m.set(`${n.staffId}|${n.certId}`, n);
    return m;
  }, [trainingNeeds]);

  const heat = useMemo(() => heatmap(matrix), [matrix]);
  const cells = useMemo(() => matrix.flatMap((r) => r.cells.map((c) => ({ c, e: r.e }))), [matrix]);
  const alerts = useMemo(() => cells.filter(({ c }) => c.status === 'EXPIRED' || c.status === 'DUE_30').sort((a, b) => (a.c.daysLeft ?? -999) - (b.c.daysLeft ?? -999)), [cells]);

  const rows = cells.filter(({ c, e }) => {
    if (dept && e.department !== dept) return false;
    if (cert && c.certId !== cert) return false;
    if (show === 'GAPS' && !isGap(c.status)) return false;
    if (show === 'DUE' && !c.status.startsWith('DUE')) return false;
    if (show === 'VALID' && c.status !== 'VALID') return false;
    const s = q.trim().toLowerCase();
    return !s || `${e.fullName} ${e.staffId} ${e.jobTitle}`.toLowerCase().includes(s);
  });
  const pg = usePaged(rows, 25, `${q}|${dept}|${cert}|${show}`);
  const key = (c: MatrixCell) => `${c.staffId}|${c.certId}`;
  const gapsNoNeed = rows.filter(({ c }) => isGap(c.status) && !openNeed.has(key(c)));

  const raise = (list: MatrixCell[]) => {
    raiseGapNeeds(list.map((c) => ({ staffId: c.staffId, certId: c.certId, expired: c.status === 'EXPIRED' })));
    setPicked([]);
  };

  if (!matrix.length)
    return (
      <div className="pr-card">
        <h3 className="tm-h3">No certification requirements</h3>
        <p className="pr-muted">Nobody at {activeTenant.name} holds a role that needs a statutory certificate. Switch to Kericho Highland Estates to see the full matrix.</p>
      </div>
    );

  return (
    <>
      {alerts.length > 0 && (
        <div className="pr-card tr-alerts">
          <div className="pr-card-head">
            <div>
              <h3>
                <AlertTriangle size={15} /> Expiry alerts
              </h3>
              <p>Expired or expiring within 30 days. Staff with an expired statutory certificate should not do the task until renewed.</p>
            </div>
          </div>
          <ul className="tr-alert-list">
            {alerts.slice(0, 8).map(({ c, e }) => {
              const need = openNeed.get(key(c));
              return (
                <li key={key(c)}>
                  <CertPill status={c.status} days={c.daysLeft} />
                  <span>
                    <strong>{e.fullName}</strong> · {certById(c.certId)?.name}
                  </span>
                  {need ? <span className="pr-muted">{need.id} · {need.status.toLowerCase()}</span> : (
                    <button className="btn btn-secondary btn-sm" onClick={() => raise([c])}>
                      Raise need
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {alerts.length > 8 && <p className="pr-muted">and {alerts.length - 8} more — filter the matrix by “Gaps” or “Due”.</p>}
        </div>
      )}

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Compliance heatmap</h3>
            <p>Share of required certificates held and in date, by department. Click a cell to filter the matrix.</p>
          </div>
          <div className="tr-legend">
            <span className="tr-heat good">90%+</span>
            <span className="tr-heat warn">70–89%</span>
            <span className="tr-heat bad">&lt;70%</span>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table tr-heat-table">
            <thead>
              <tr>
                <th>Department</th>
                {heat.certs.map((c) => (
                  <th key={c.id} title={`${c.name} · ${c.authority}`}>
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heat.grid.map((row) => (
                <tr key={row.dept}>
                  <td>
                    <strong>{row.dept}</strong>
                  </td>
                  {row.cells.map((x, i) =>
                    x ? (
                      <td key={heat.certs[i].id}>
                        <button
                          className={`tr-heat ${heatCls(x.pct)}`}
                          onClick={() => {
                            setDept(row.dept);
                            setCert(x.certId);
                            setShow('ALL');
                          }}
                          title={`${x.ok} of ${x.total} compliant${x.due ? ` · ${x.due} due within 90 days` : ''}`}
                        >
                          {x.pct}%<small>{x.ok}/{x.total}</small>
                        </button>
                      </td>
                    ) : (
                      <td key={heat.certs[i].id} className="tr-na">
                        —
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Skills & certifications matrix</h3>
            <p>Each row is one certificate a person's role requires. Status is worked out from the latest certificate on file.</p>
          </div>
          <div className="tm-actions">
            <button className="btn btn-secondary" onClick={() => downloadCsv(`skills-matrix-${today}.csv`, matrixCsv(matrix))}>
              <Download size={14} /> Export CSV
            </button>
            <button className="btn btn-primary" disabled={!gapsNoNeed.length} onClick={() => raise(gapsNoNeed.map((x) => x.c))}>
              <ListPlus size={14} /> Raise needs for {gapsNoNeed.length} gap{gapsNoNeed.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
        <div className="pr-toolbar tr-toolbar">
          <div className="tr-search grow">
            <Search size={14} />
            <input className="form-control" placeholder="Search name, staff ID or role" value={q} onChange={(ev) => setQ(ev.target.value)} aria-label="Search" />
          </div>
          <select className="form-control" value={dept} onChange={(ev) => setDept(ev.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {heat.depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select className="form-control" value={cert} onChange={(ev) => setCert(ev.target.value)} aria-label="Certification">
            <option value="">All certifications</option>
            {CERTIFICATIONS.filter((c) => heat.certs.includes(c)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Chips
            label="Status"
            value={show}
            onChange={setShow}
            options={[
              { id: 'ALL', label: 'All', n: cells.length },
              { id: 'GAPS', label: 'Gaps', n: cells.filter(({ c }) => isGap(c.status)).length },
              { id: 'DUE', label: 'Due ≤90 days', n: cells.filter(({ c }) => c.status.startsWith('DUE')).length },
              { id: 'VALID', label: 'Valid', n: cells.filter(({ c }) => c.status === 'VALID').length }
            ]}
          />
        </div>
        {picked.length > 0 && (
          <div className="pr-note tr-bulk">
            {picked.length} selected
            <button className="btn btn-primary btn-sm" onClick={() => raise(cells.filter(({ c }) => picked.includes(key(c))).map((x) => x.c))}>
              Raise needs
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
        )}
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Employee</th>
                <th>Certification</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={6}>Nothing matches these filters.</Empty>}
              {pg.rows.map(({ c, e }) => {
                const need = openNeed.get(key(c));
                const cd = certById(c.certId);
                const canPick = isGap(c.status) && !need;
                return (
                  <tr key={key(c)} data-cell={key(c)}>
                    <td>
                      {canPick && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.fullName} ${cd?.name}`}
                          checked={picked.includes(key(c))}
                          onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, key(c)] : p.filter((x) => x !== key(c))))}
                        />
                      )}
                    </td>
                    <td>
                      <EmpCell e={byId.get(c.staffId)} id={c.staffId} sub={e.department} />
                    </td>
                    <td>
                      <strong>{cd?.name}</strong>
                      <div className="muted">
                        {cd?.authority} · {c.rule}
                      </div>
                    </td>
                    <td>
                      <CertPill status={c.status} days={c.daysLeft} />
                    </td>
                    <td>
                      {c.record ? fmtDate(c.record.expiresOn) : <span className="muted">Never certified</span>}
                      {c.record && <div className="muted">{c.record.ref}</div>}
                    </td>
                    <td>
                      <div className="tm-actions">
                        {need ? (
                          <Pill cls="info" title={need.reason}>
                            {need.id} · {need.status}
                          </Pill>
                        ) : (
                          c.status !== 'VALID' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => raise([c])}>
                              Raise need
                            </button>
                          )
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Record a certificate the employee already holds"
                          onClick={() => {
                            setRecording(c);
                            setIssued(today);
                            setRef('');
                          }}
                        >
                          <FilePlus2 size={13} /> Record
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="certificates" />
      </div>

      <details className="pr-card tr-rules">
        <summary>Requirements by role</summary>
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Role group</th>
              <th>Matches</th>
              <th>Required certificates</th>
            </tr>
          </thead>
          <tbody>
            {ROLE_RULES.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.label}</strong>
                </td>
                <td className="muted">{[r.department, r.title ? `title: ${r.title.source.replace(/\\|\^|\$/g, '').replace(/\|/g, ', ')}` : ''].filter(Boolean).join(' · ')}</td>
                <td>{r.certs.map((c) => `${certById(c)?.name} (${certById(c)?.validityMonths} months)`).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {recording && (
        <Modal
          title="Record certificate"
          subtitle={`${byId.get(recording.staffId)?.fullName} · ${certById(recording.certId)?.name}`}
          onClose={() => setRecording(null)}
          width={520}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRecording(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!issued || issued > today}
                onClick={() => {
                  recordCertificate(recording.staffId, recording.certId, issued, ref.trim());
                  setRecording(null);
                }}
              >
                Save certificate
              </button>
            </>
          }
        >
          <div className="pr-form-grid">
            <label className="req-field">
              <span>Issued on</span>
              <input type="date" className="form-control" value={issued} max={today} onChange={(ev) => setIssued(ev.target.value)} />
            </label>
            <label className="req-field">
              <span>Certificate number</span>
              <input className="form-control" value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder="e.g. DOSHS/BO/2231" />
            </label>
          </div>
          <p className="pr-note">
            Valid for {certById(recording.certId)?.validityMonths} months from the issue date ({certById(recording.certId)?.authority}).
          </p>
        </Modal>
      )}
    </>
  );
};
