import React, { useMemo, useState } from 'react';
import { PackageCheck, Search, UserPlus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { PPE_ITEMS, PPE_RULES, SITES } from '../../../data/oshConfig';
import { ppeFor, ppeStatus, siteOf, type PpeIssue, type PpeLine } from '../../../data/oshEngine';
import type { HREmployee } from '../../../types';
import { addDays } from '../../../data/timeEngine';
import { Chips, EmpCell, Empty, fmt, Pill, useOshOrg } from './shared';

const LINE_CLS: Record<PpeLine['state'], string> = { MISSING: 'critical', DUE: 'critical', SOON: 'warning', OK: 'success' };
const LINE_LABEL: Record<PpeLine['state'], string> = { MISSING: 'Not issued', DUE: 'Replace now', SOON: 'Replace soon', OK: 'In date' };

export const PpeTab: React.FC = () => {
  const { ppeIssues, selectedOrgId, onboardingRecords } = useApp();
  const org = useOshOrg();
  const [filter, setFilter] = useState<'ACTION' | 'ALL'>('ACTION');
  const [q, setQ] = useState('');
  const [issueFor, setIssueFor] = useState<HREmployee | null>(null);
  const issues = useMemo(() => ppeIssues.filter((x) => x.orgId === selectedOrgId), [ppeIssues, selectedOrgId]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return org.staff
      .map((e) => {
        const lines = ppeStatus(e, issues, org.today);
        return { e, lines, missing: lines.filter((l) => l.state === 'MISSING').length, due: lines.filter((l) => l.state === 'DUE').length, soon: lines.filter((l) => l.state === 'SOON').length };
      })
      .filter((r) => r.lines.length && (filter === 'ALL' || r.missing + r.due + r.soon > 0))
      .filter((r) => !s || `${r.e.fullName} ${r.e.staffId} ${r.e.jobTitle}`.toLowerCase().includes(s))
      .sort((a, b) => b.missing + b.due - (a.missing + a.due) || a.e.fullName.localeCompare(b.e.fullName));
  }, [org, issues, filter, q]);
  const pg = usePaged(rows, 10, `${filter}|${q}`);

  // New starters: onboarding records still in their first 90 days, plus anyone who joined in the last 90 days without a full kit
  const starters = useMemo(() => {
    const recent = org.staff.filter((e) => e.joinedDate >= addDays(org.today, -90));
    const fromOnboarding = onboardingRecords.filter((o) => o.orgId === selectedOrgId && (o.status === 'PRE_BOARDING' || o.status === 'FIRST_90_DAYS'));
    const out: { key: string; name: string; role: string; e?: HREmployee; missing: number; note: string }[] = [];
    for (const o of fromOnboarding) {
      const e = o.staffId ? org.byId.get(o.staffId) : undefined;
      const missing = e ? ppeStatus(e, issues, org.today).filter((l) => l.state === 'MISSING').length : ppeFor({ jobTitle: o.role, department: o.department ?? '' }).length;
      if (missing) out.push({ key: o.id, name: o.employeeName, role: o.role, e, missing, note: e ? `Started ${fmt(e.joinedDate)}` : `Pre-boarding · starts ${fmt(o.startDate)}` });
    }
    for (const e of recent) {
      if (out.some((x) => x.e?.staffId === e.staffId)) continue;
      const missing = ppeStatus(e, issues, org.today).filter((l) => l.state === 'MISSING').length;
      if (missing) out.push({ key: e.staffId, name: e.fullName, role: e.jobTitle, e, missing, note: `Joined ${fmt(e.joinedDate)}` });
    }
    return out;
  }, [org, issues, onboardingRecords, selectedOrgId]);

  const recent = [...issues].sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id.localeCompare(a.id)).slice(0, 8);

  return (
    <>
      {starters.length > 0 && (
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>New starters needing PPE</h3>
              <p>From onboarding and recent joiners. Issue the role's kit on day one (OSHA 2007 s.101).</p>
            </div>
          </div>
          <ul className="osh-list">
            {starters.map((s) => (
              <li key={s.key}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="pr-muted">
                    {s.role} · {s.note} · {s.missing} item{s.missing > 1 ? 's' : ''} to issue
                  </span>
                </div>
                {s.e ? (
                  <button className="btn btn-primary btn-sm" onClick={() => setIssueFor(s.e!)}>
                    <UserPlus size={13} /> Issue kit
                  </button>
                ) : (
                  <Pill cls="info">Prepare kit</Pill>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>PPE register</h3>
            <p>Issues against the role-based matrix, with each item's lifespan and replacement date.</p>
          </div>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <Chips
            label="PPE filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'ACTION', label: 'Needs action' },
              { id: 'ALL', label: 'Everyone' }
            ]}
          />
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search employee" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Area</th>
                <th>Kit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={4}>Everyone's PPE is in date.</Empty>}
              {pg.rows.map((r) => (
                <tr key={r.e.staffId}>
                  <td>
                    <EmpCell e={r.e} id={r.e.staffId} />
                  </td>
                  <td>{SITES[siteOf(r.e)].label}</td>
                  <td>
                    <div className="osh-ppe-chips">
                      {r.lines.map((l) => (
                        <span key={l.itemId} className={`osh-ppe-chip ${l.state.toLowerCase()}`} title={`${PPE_ITEMS[l.itemId].name}: ${LINE_LABEL[l.state]}${l.replaceBy ? ` · replace by ${fmt(l.replaceBy)}` : ''}`}>
                          {PPE_ITEMS[l.itemId].name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setIssueFor(r.e)}>
                      <PackageCheck size={13} /> Issue
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="employees" sizes={[10, 25, 50]} />
        <p className="pr-muted osh-legend">
          <span className="osh-ppe-chip ok">In date</span> <span className="osh-ppe-chip soon">Replace within 30 days</span> <span className="osh-ppe-chip due">Past its life</span> <span className="osh-ppe-chip missing">Not issued</span>
        </p>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Role-based PPE matrix</h3>
            <p>Lifespan in months in brackets.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Applies to</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {PPE_RULES.map((r) => (
                <tr key={r.label}>
                  <td>
                    <strong>{r.label}</strong>
                  </td>
                  <td>
                    {r.items.map((id) => (
                      <span key={id} className="osh-ppe-chip neutral">
                        {PPE_ITEMS[id].name} ({PPE_ITEMS[id].lifespanMonths})
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <h3 className="osh-h3">Latest issues</h3>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Item</th>
                <th>Size</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && <Empty cols={5}>Nothing issued yet.</Empty>}
              {recent.map((x) => (
                <tr key={x.id}>
                  <td>{fmt(x.issuedOn)}</td>
                  <td>{org.name(x.staffId)}</td>
                  <td>
                    {PPE_ITEMS[x.itemId]?.name} × {x.qty}
                  </td>
                  <td>{x.size}</td>
                  <td>{x.reason.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {issueFor && <IssueModal e={issueFor} onClose={() => setIssueFor(null)} />}
    </>
  );
};

const IssueModal: React.FC<{ e: HREmployee; onClose: () => void }> = ({ e, onClose }) => {
  const { ppeIssues, issuePpe } = useApp();
  const org = useOshOrg();
  const lines = ppeStatus(e, ppeIssues, org.today);
  const [pick, setPick] = useState<Record<string, { on: boolean; size: string; qty: number; reason: PpeIssue['reason'] }>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.itemId, { on: l.state !== 'OK', size: l.last?.size ?? PPE_ITEMS[l.itemId].sizes[Math.floor(PPE_ITEMS[l.itemId].sizes.length / 2)], qty: 1, reason: l.state === 'MISSING' ? 'NEW' : 'REPLACEMENT' }])
    )
  );
  const chosen = Object.entries(pick).filter(([, v]) => v.on);
  const submit = () => {
    const n = issuePpe(chosen.map(([itemId, v]) => ({ staffId: e.staffId, itemId, size: v.size, qty: v.qty, reason: v.reason, issuedOn: org.today })));
    if (n) onClose();
  };
  const set = (id: string, patch: Partial<(typeof pick)[string]>) => setPick({ ...pick, [id]: { ...pick[id], ...patch } });
  return (
    <Modal
      title={`Issue PPE · ${e.fullName}`}
      subtitle={`${e.staffId} · ${e.jobTitle} · ${SITES[siteOf(e)].label}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!chosen.length} onClick={submit}>
            <PackageCheck size={14} /> Issue {chosen.length} item{chosen.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div className="pr-table-scroll">
        <table className="hr-table pr-table osh-issue">
          <thead>
            <tr>
              <th />
              <th>Item</th>
              <th>Last issued</th>
              <th>Size</th>
              <th className="num">Qty</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = pick[l.itemId];
              return (
                <tr key={l.itemId}>
                  <td>
                    <input type="checkbox" checked={v.on} onChange={(ev) => set(l.itemId, { on: ev.target.checked })} aria-label={`Issue ${PPE_ITEMS[l.itemId].name}`} />
                  </td>
                  <td>
                    {PPE_ITEMS[l.itemId].name}
                    <div>
                      <Pill cls={LINE_CLS[l.state]}>{LINE_LABEL[l.state]}</Pill>
                    </div>
                  </td>
                  <td>
                    {l.last ? fmt(l.last.issuedOn) : '—'}
                    {l.replaceBy && <div className="muted">Replace by {fmt(l.replaceBy)}</div>}
                  </td>
                  <td>
                    <select className="form-control" value={v.size} onChange={(ev) => set(l.itemId, { size: ev.target.value })} aria-label="Size">
                      {PPE_ITEMS[l.itemId].sizes.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input className="form-control osh-qty" type="number" min={1} max={10} value={v.qty} onChange={(ev) => set(l.itemId, { qty: Math.max(1, Number(ev.target.value)) })} aria-label="Quantity" />
                  </td>
                  <td>
                    <select className="form-control" value={v.reason} onChange={(ev) => set(l.itemId, { reason: ev.target.value as PpeIssue['reason'] })} aria-label="Reason">
                      <option value="NEW">New</option>
                      <option value="REPLACEMENT">Replacement</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="LOST">Lost</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pr-muted">The employee signs the PPE register on collection. PPE is free to the employee (OSHA 2007 s.101).</p>
    </Modal>
  );
};
