import React, { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { usePaged, Pager } from '../../../components/common/Pager';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { CHANGE_LABEL, type ChangeKind, type EmployeeChange } from '../../../data/hireConfig';
import { countNodes, daysBetween, fmtDate, gradeOf, orgTree, probationOf, shortGrade, todayIso, type OrgNode } from '../../../data/hireEngine';
import { Card, Empty, Pill, Stat, initials } from './shared';
import { ChangeModal, DecideChangeModal, ProfileDrawer, reveal } from './EmployeeProfile';
import { EditDetailsModal } from './EditDetailsModal';
import { ProbationTab } from './OnboardingTabs';

const findType = (name: string) => CONTRACT_TYPES.find((c) => c.name === name);
const isRateBased = (name: string) => ['DAILY_RATE', 'OUTPUT_RATE'].includes(findType(name)?.payBasis ?? '');
const contractTone = (name: string) => {
  const ct = findType(name);
  if (!ct) return 'info';
  if (ct.payBasis === 'MONTHLY_SALARY') return ct.hasEndDate ? 'info' : 'primary';
  return 'warning';
};

const useProfile = (unmask = false) => {
  const { hrEmployees } = useApp();
  const [id, setId] = useState<string | null>(null);
  const e = hrEmployees.find((x) => x.staffId === id);
  return { open: setId, node: e ? <ProfileDrawer key={e.staffId} e={e} unmask={unmask} onClose={() => setId(null)} /> : null };
};

/** Edit details straight from a directory row; pay and job changes hand over to the change request. */
const useEditDetails = (unmask: boolean) => {
  const { hrEmployees } = useApp();
  const [id, setId] = useState<string | null>(null);
  const [change, setChange] = useState<{ staffId: string; kind: ChangeKind } | null>(null);
  const e = hrEmployees.find((x) => x.staffId === id);
  const ce = hrEmployees.find((x) => x.staffId === change?.staffId);
  return {
    open: setId,
    node: (
      <>
        {e && (
          <EditDetailsModal
            e={e}
            unmask={unmask}
            onClose={() => setId(null)}
            onRequestChange={(kind) => {
              setId(null);
              setChange({ staffId: e.staffId, kind });
            }}
          />
        )}
        {ce && change && <ChangeModal e={ce} kind={change.kind} onClose={() => setChange(null)} />}
      </>
    )
  };
};

/* ------------------------------------------------------------------ directory */

export const DirectoryTab: React.FC<{ unmask: boolean }> = ({ unmask }) => {
  const { tenantEmployees, hireRules, employeeChanges, selectedOrgId } = useApp();
  const profile = useProfile(unmask);
  const edit = useEditDetails(unmask);
  const [filterType, setFilterType] = useState('All');
  const [status, setStatus] = useState('Current');
  const [search, setSearch] = useState('');
  const today = todayIso();

  const onRoster = tenantEmployees.filter((e) => e.status !== 'TERMINATED');
  const byType = CONTRACT_TYPES.map((c) => ({ c, n: onRoster.filter((e) => e.contractType === c.name).length })).filter((x) => x.n);
  const prob = onRoster.map((e) => probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths)).filter((p) => p.applies && p.status !== 'CONFIRMED');
  const ending = onRoster.filter((e) => e.contractEndDate && e.contractEndDate >= today && daysBetween(today, e.contractEndDate) <= 90);
  const pending = employeeChanges.filter((c) => c.orgId === selectedOrgId && c.status === 'PENDING');
  const starting = onRoster.filter((e) => e.joinedDate > today);

  const list = tenantEmployees
    .filter((e) => (status === 'All' ? true : status === 'Current' ? e.status !== 'TERMINATED' : status === 'Probation' ? (() => { const p = probationOf(e, hireRules.probationMonths); return p.applies && p.status !== 'CONFIRMED' && e.status !== 'TERMINATED'; })() : e.status === status))
    .filter((e) => filterType === 'All' || e.contractType === filterType)
    .filter((e) => !search || `${e.fullName} ${e.staffId} ${e.department} ${e.jobTitle}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.joinedDate > today ? 1 : 0) - (a.joinedDate > today ? 1 : 0) || a.staffId.localeCompare(b.staffId));
  const pg = usePaged(list, 25, `${filterType}|${status}|${search}`);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Active roster" value={`${onRoster.length} staff`} sub={`${onRoster.filter((e) => !isRateBased(e.contractType)).length} salaried, ${onRoster.filter((e) => isRateBased(e.contractType)).length} daily-rated${starting.length ? ` · ${starting.length} starting soon` : ''}`} />
        <Stat label="Contract mix" value={byType.map((x) => x.n).join(' / ')} sub={byType.map((x) => x.c.name.replace(' Contract', '').replace('Standard Employment', 'Permanent').toLowerCase()).join(' / ')} />
        <Stat label="Probation and contracts" value={`${prob.length} on probation`} sub={`${prob.filter((p) => (p.daysLeft ?? 99) <= 30).length} reviews due in 30 days · ${ending.length} contracts end within 90 days`} tone="#d97706" />
        <Stat label="Changes waiting" value={`${pending.length} requests`} sub={pending.length ? pending.map((c) => CHANGE_LABEL[c.kind].toLowerCase()).slice(0, 3).join(', ') : 'Nothing waiting for approval'} tone={pending.length ? 'var(--brand-primary)' : undefined} />
      </div>

      <div className="digicraft-toolbar" style={{ marginBottom: 16 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search employee by name, staff ID, department, or title..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          {['All', ...CONTRACT_TYPES.map((c) => c.name)].map((t) => (
            <button key={t} className={`digicraft-filter-pill ${filterType === t ? 'active' : ''}`} onClick={() => setFilterType(t)}>
              {t}
            </button>
          ))}
          <select className="form-control hi-select-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="Current">Current staff</option>
            <option value="Probation">On probation</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TERMINATED">Left</option>
            <option value="All">Everyone</option>
          </select>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Staff ID</th>
                <th>Employee Name</th>
                <th>Contract & Grade</th>
                <th>Department / Branch</th>
                <th>National ID</th>
                <th>KRA PIN</th>
                <th>NSSF / SHIF</th>
                <th>Pay Rail</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={10}>No employees found for current organization and search criteria.</Empty>}
              {pg.rows.map((emp) => {
                const p = probationOf(emp, hireRules.probationMonths);
                const startsLater = emp.joinedDate > today;
                return (
                  <tr key={emp.id} className="hi-click" onClick={() => profile.open(emp.staffId)} title="Open the employee profile">
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>{emp.staffId}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{emp.fullName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{emp.jobTitle}</div>
                    </td>
                    <td>
                      <span className={`digicraft-status-pill ${contractTone(emp.contractType)}`}>{emp.contractType}</span>
                      <div className="hi-sub">
                        {shortGrade(gradeOf(emp))}
                        {emp.contractEndDate ? ` · ends ${fmtDate(emp.contractEndDate)}` : ''}
                      </div>
                    </td>
                    <td>
                      <div>{emp.department}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {emp.branch} {emp.block ? `• ${emp.block}` : ''}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{reveal(emp.nationalIdMasked, unmask)}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{reveal(emp.kraPinMasked, unmask)}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{reveal(emp.nssfNoMasked, unmask)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{reveal(emp.shifNoMasked, unmask)}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 11 }}>
                        {isRateBased(emp.contractType) || emp.paymentMethod === 'MPESA' ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>M-Pesa ({reveal(emp.mpesaPhoneMasked, unmask)})</span>
                        ) : (
                          <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Bank ({reveal(emp.bankAccountMasked, unmask)})</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {startsLater ? (
                        <Pill tone="info">Starts {fmtDate(emp.joinedDate)}</Pill>
                      ) : (
                        <Pill tone={emp.status === 'ACTIVE' ? 'success' : emp.status === 'TERMINATED' ? 'danger' : 'warning'}>{emp.status === 'TERMINATED' ? 'LEFT' : emp.status.replace('_', ' ')}</Pill>
                      )}
                      {p.applies && p.status !== 'CONFIRMED' && emp.status !== 'TERMINATED' && <div className="hi-sub">Probation to {fmtDate(p.end)}</div>}
                    </td>
                    <td>
                      <span className="hi-row-actions">
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 6px', fontSize: 11 }}
                          aria-label={`Edit details of ${emp.fullName}`}
                          title="Edit details"
                          onClick={(e) => {
                            e.stopPropagation();
                            edit.open(emp.staffId);
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            profile.open(emp.staffId);
                          }}
                        >
                          Profile →
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0 12px' }}>
          <Pager p={pg} noun="employees" />
        </div>
      </div>
      {profile.node}
      {edit.node}
    </>
  );
};

/* ------------------------------------------------------------------ changes and audit */

export const ChangesTab: React.FC = () => {
  const { employeeChanges, selectedOrgId, hireAudit, hrEmployees } = useApp();
  const profile = useProfile();
  const [deciding, setDeciding] = useState<EmployeeChange | null>(null);
  const mine = employeeChanges.filter((c) => c.orgId === selectedOrgId);
  const pending = mine.filter((c) => c.status === 'PENDING');
  const decided = mine.filter((c) => c.status !== 'PENDING').sort((a, b) => (b.decidedOn ?? '').localeCompare(a.decidedOn ?? ''));
  const pgD = usePaged(decided, 10);
  const orgStaff = new Set(hrEmployees.filter((e) => e.orgId === selectedOrgId).map((e) => e.staffId));
  const trail = hireAudit.filter((a) => a.area !== 'Employee' || orgStaff.has(a.ref));
  const pgA = usePaged(trail, 10);
  return (
    <>
      <Card title="Waiting for approval" sub="Promotions, increments, transfers, contract and probation decisions. The requester and the employee cannot approve.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Employee</th>
                <th>Change</th>
                <th>Effective</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <Empty cols={6}>Nothing is waiting.</Empty>}
              {pending.map((c) => (
                <tr key={c.id}>
                  <td className="hi-mono">{c.id}</td>
                  <td>
                    <button className="hi-link" onClick={() => profile.open(c.staffId)}>
                      {c.staffName}
                    </button>
                    <div className="hi-sub">{c.staffId}</div>
                  </td>
                  <td className="hi-wrap">
                    <strong>{CHANGE_LABEL[c.kind]}</strong>
                    <div className="hi-sub">{c.summary}</div>
                  </td>
                  <td>{fmtDate(c.effectiveFrom)}</td>
                  <td>
                    {c.requestedBy}
                    <div className="hi-sub">{fmtDate(c.requestedOn)}</div>
                  </td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={() => setDeciding(c)}>
                      Decide
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Decided changes">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Employee</th>
                <th>Change</th>
                <th>Effective</th>
                <th>Outcome</th>
                <th>Requested / decided</th>
              </tr>
            </thead>
            <tbody>
              {pgD.rows.length === 0 && <Empty cols={6}>No decisions yet.</Empty>}
              {pgD.rows.map((c) => (
                <tr key={c.id}>
                  <td className="hi-mono">{c.id}</td>
                  <td>{c.staffName}</td>
                  <td className="hi-wrap">
                    <strong>{CHANGE_LABEL[c.kind]}</strong>
                    <div className="hi-sub">{c.summary}</div>
                  </td>
                  <td>{fmtDate(c.effectiveFrom)}</td>
                  <td>
                    <Pill tone={c.status === 'APPROVED' ? 'success' : 'danger'}>{c.status.toLowerCase()}</Pill>
                    {c.comment && <div className="hi-sub">{c.comment}</div>}
                  </td>
                  <td className="hi-sub">
                    {c.requestedBy} → {c.decidedBy} · {fmtDate(c.decidedOn)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pgD} noun="changes" sizes={[10, 25]} />
      </Card>
      <Card title="Audit trail" sub="Every action in requisitions, recruitment, onboarding and the employee master during this session.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                <th>Area</th>
                <th>Record</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pgA.rows.length === 0 && <Empty cols={5}>No actions recorded yet in this session.</Empty>}
              {pgA.rows.map((a, i) => (
                <tr key={i}>
                  <td className="hi-sub">{a.at}</td>
                  <td>{a.by}</td>
                  <td>{a.area}</td>
                  <td className="hi-mono">{a.ref}</td>
                  <td className="hi-wrap">
                    {a.action.startsWith('Sensitive · ') ? (
                      <>
                        <Pill tone="warning">Sensitive</Pill> {a.action.slice(12)}
                      </>
                    ) : (
                      a.action
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pgA} noun="entries" sizes={[10, 25, 50]} />
      </Card>
      {deciding && <DecideChangeModal c={deciding} onClose={() => setDeciding(null)} />}
      {profile.node}
    </>
  );
};

/* ------------------------------------------------------------------ contracts and probation */

export const ContractsTab: React.FC = () => {
  const { tenantEmployees, employeeChanges } = useApp();
  const [change, setChange] = useState<{ e: HREmployee; kind: ChangeKind } | null>(null);
  const today = todayIso();
  const fixed = tenantEmployees
    .filter((e) => e.status !== 'TERMINATED' && findType(e.contractType)?.hasEndDate && findType(e.contractType)?.payBasis === 'MONTHLY_SALARY')
    .sort((a, b) => (a.contractEndDate ?? '9999').localeCompare(b.contractEndDate ?? '9999'));
  return (
    <>
      <Card title="Fixed-term contracts" sub="Renew or convert before the end date; payroll stops paying a contract that has lapsed only when a separation is recorded.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Contract</th>
                <th>Ends</th>
                <th>Pending</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fixed.length === 0 && <Empty cols={5}>No fixed-term contracts.</Empty>}
              {fixed.map((e) => {
                const left = e.contractEndDate ? daysBetween(today, e.contractEndDate) : null;
                const pending = employeeChanges.find((c) => c.staffId === e.staffId && c.status === 'PENDING' && c.kind.endsWith('CONTRACT'));
                return (
                  <tr key={e.staffId}>
                    <td>
                      <strong>{e.fullName}</strong>
                      <div className="hi-sub">
                        {e.staffId} · {e.jobTitle}
                      </div>
                    </td>
                    <td>{e.contractType}</td>
                    <td>
                      {e.contractEndDate ? fmtDate(e.contractEndDate) : 'Not recorded'}
                      {left !== null && <div className={`hi-sub ${left < 30 ? 'hi-neg' : ''}`}>{left < 0 ? `${-left} days ago` : `${left} days`}</div>}
                    </td>
                    <td className="hi-sub">{pending ? `${CHANGE_LABEL[pending.kind]} ${pending.id}` : '—'}</td>
                    <td>
                      <div className="hi-actions">
                        <button className="btn btn-secondary btn-sm" disabled={!!pending} onClick={() => setChange({ e, kind: 'RENEW_CONTRACT' })}>
                          Renew
                        </button>
                        <button className="btn btn-secondary btn-sm" disabled={!!pending} onClick={() => setChange({ e, kind: 'CONVERT_CONTRACT' })}>
                          Make permanent
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <ProbationTab />
      {change && <ChangeModal e={change.e} kind={change.kind} onClose={() => setChange(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ org chart */

const Node: React.FC<{ n: OrgNode; depth: number; open: Set<string>; toggle: (id: string) => void; onPick: (id: string) => void; hit: string }> = ({ n, depth, open, toggle, onPick, hit }) => {
  const isOpen = open.has(n.e.staffId);
  const match = hit && `${n.e.fullName} ${n.e.jobTitle} ${n.e.staffId}`.toLowerCase().includes(hit.toLowerCase());
  return (
    <li>
      <div className={`hi-node ${match ? 'hit' : ''}`} style={{ marginLeft: Math.min(depth, 6) * 18 }}>
        {n.children.length ? (
          <button className="hi-node-toggle" onClick={() => toggle(n.e.staffId)} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="hi-node-toggle" />
        )}
        <span className="hi-avatar">{initials(n.e.fullName)}</span>
        <button className="hi-node-body" onClick={() => onPick(n.e.staffId)}>
          <strong>{n.e.fullName}</strong>
          <span>
            {n.e.jobTitle} · {n.e.department}
          </span>
        </button>
        {n.children.length > 0 && <span className="hi-node-count">{countNodes(n) - 1}</span>}
      </div>
      {isOpen && n.children.length > 0 && (
        <ul>
          {n.children.map((c) => (
            <Node key={c.e.staffId} n={c} depth={depth + 1} open={open} toggle={toggle} onPick={onPick} hit={hit} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const OrgChartTab: React.FC = () => {
  const { tenantEmployees, hrEmployees } = useApp();
  const profile = useProfile();
  const staff = useMemo(() => tenantEmployees.filter((e) => e.status !== 'TERMINATED'), [tenantEmployees]);
  const roots = useMemo(() => orgTree(staff, hrEmployees), [staff, hrEmployees]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(roots.flatMap((r) => [r.e.staffId, ...r.children.filter((c) => c.children.length).map((c) => c.e.staffId)])));
  const [q, setQ] = useState('');
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const all = () => {
    const ids: string[] = [];
    const walk = (n: OrgNode) => {
      if (n.children.length) ids.push(n.e.staffId);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    setOpen(new Set(ids));
  };
  const managers = staff.filter((e) => roots.some(function has(n): boolean { return (n.e.staffId === e.staffId && n.children.length > 0) || n.children.some(has); }));
  return (
    <>
      <Card
        title="Reporting structure"
        sub={`${staff.length} people under ${roots.length} top-level role${roots.length === 1 ? '' : 's'}, from the supervisor on each record (department heads where none is set). ${managers.length} people have direct reports.`}
        actions={
          <>
            <div className="digicraft-search-box grow">
              <Search size={15} className="digicraft-search-icon" />
              <input placeholder="Highlight a name or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Highlight" />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={all}>
              Expand all
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(new Set())}>
              Collapse
            </button>
          </>
        }
      >
        <ul className="hi-tree">
          {roots.map((r) => (
            <Node key={r.e.staffId} n={r} depth={0} open={open} toggle={toggle} onPick={profile.open} hit={q} />
          ))}
        </ul>
      </Card>
      {profile.node}
    </>
  );
};
