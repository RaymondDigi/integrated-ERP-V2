import React, { useMemo, useState } from 'react';
import { Award, Banknote, Check, Pencil, Plus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { longServiceOption, yearsOfService, type WelfareRequest, type WelfareStatus, type WelfareType } from '../../../data/welfareSeed';
import { Card, Empty, Field, FilterPills, fmt, kes, Modal, Person, Pill, SearchBox, StaffSelect, useWfOrg, type Tone } from './shared';

const STATUS: Record<WelfareStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting approval', tone: 'warning' },
  APPROVED: { label: 'Approved, to pay', tone: 'info' },
  DECLINED: { label: 'Declined', tone: 'critical' },
  PAID: { label: 'Paid', tone: 'success' }
};

/** Welfare fund position for the selected company this year */
export const useWelfareFund = () => {
  const { welfareFunds, welfareRequests } = useApp();
  const org = useWfOrg();
  return useMemo(() => {
    const f = welfareFunds.find((x) => x.orgId === org.orgId);
    if (!f) return null;
    const staff = f.contributors * f.staffMonthly * f.monthsToDate;
    const employer = staff * f.employerMatch;
    const year = org.today.slice(0, 4);
    const paidHere = welfareRequests.filter((r) => r.orgId === org.orgId && r.paidVia === 'FUND' && r.paidOn?.startsWith(year)).reduce((t, r) => t + r.amount, 0);
    const paidOut = f.paidOutEarlier + paidHere;
    return { f, staff, employer, paidOut, balance: f.openingBalance + staff + employer - paidOut };
  }, [welfareFunds, welfareRequests, org.orgId, org.today]);
};

/** Staff reaching a 5, 10, 15 or 20-year milestone by 31 December who have no award request yet */
export const useLongServiceDue = () => {
  const { welfareRequests } = useApp();
  const org = useWfOrg();
  return useMemo(() => {
    const yearEnd = `${org.today.slice(0, 4)}-12-31`;
    return org.staff
      .map((e) => ({ e, years: yearsOfService(e.joinedDate, yearEnd) }))
      .map((x) => ({ ...x, option: longServiceOption(x.years) }))
      .filter((x) => x.option && !welfareRequests.some((r) => r.staffId === x.e.staffId && r.type === 'LONG_SERVICE' && r.status !== 'DECLINED' && r.requestedOn.slice(0, 4) === org.today.slice(0, 4)));
  }, [org, welfareRequests]);
};

type Filter = 'PENDING' | 'APPROVED' | 'PAID' | 'DECLINED' | 'ALL';

export const WelfareTab: React.FC = () => {
  const { welfareRequests, welfarePolicies, decideWelfareRequest, payrollOpenPeriod } = useApp();
  const org = useWfOrg();
  const fund = useWelfareFund();
  const due = useLongServiceDue();
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<{ staffId?: string; type?: WelfareType; optionId?: string } | null>(null);
  const [declining, setDeclining] = useState<WelfareRequest | null>(null);
  const [paying, setPaying] = useState<WelfareRequest | null>(null);

  const requests = useMemo(() => welfareRequests.filter((r) => r.orgId === org.orgId), [welfareRequests, org.orgId]);
  const policyOf = (t: WelfareType) => welfarePolicies.find((p) => p.type === t);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return requests
      .filter((r) => filter === 'ALL' || r.status === filter)
      .filter((r) => !s || `${r.ref} ${org.name(r.staffId)} ${r.staffId} ${welfarePolicies.find((p) => p.type === r.type)?.label ?? ''} ${r.beneficiaryName ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
  }, [requests, filter, q, org, welfarePolicies]);
  const pg = usePaged(rows, 10, `${filter}|${q}|${org.orgId}`);
  const n = (s: WelfareStatus) => requests.filter((r) => r.status === s).length;

  return (
    <>
      <div className="wf-grid-2">
        <Card
          title="Entitlement policy"
          sub="What the company pays for each life event. Amounts apply to new requests."
          actions={
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing((v) => !v)}>
              {editing ? <Check size={13} /> : <Pencil size={13} />} {editing ? 'Done' : 'Edit amounts'}
            </button>
          }
        >
          <PolicyTable editing={editing} />
        </Card>

        <div className="wf-stack">
          {fund && (
            <Card title="Staff welfare fund" sub={`Staff contribute ${kes(fund.f.staffMonthly)} a month through the payroll deduction “Staff welfare fund” (WELFARE); the company matches ${fund.f.employerMatch === 1 ? 'shilling for shilling' : `${fund.f.employerMatch}×`}.`}>
              <div className="pr-kv">
                <div>
                  <span>Brought forward</span>
                  <strong>{kes(fund.f.openingBalance)}</strong>
                  <small>1 January</small>
                </div>
                <div>
                  <span>Staff contributions</span>
                  <strong>{kes(fund.staff)}</strong>
                  <small>
                    {fund.f.contributors} staff × {fund.f.monthsToDate} months
                  </small>
                </div>
                <div>
                  <span>Company match</span>
                  <strong>{kes(fund.employer)}</strong>
                </div>
                <div>
                  <span>Paid out this year</span>
                  <strong>{kes(fund.paidOut)}</strong>
                </div>
                <div>
                  <span>Balance</span>
                  <strong style={{ color: fund.balance < 100_000 ? 'var(--status-critical)' : undefined }}>{kes(fund.balance)}</strong>
                </div>
              </div>
            </Card>
          )}
          <Card title="Long-service awards due" sub={`Staff completing 5, 10, 15 or 20 years by 31 December ${org.today.slice(0, 4)} with no award request yet.`}>
            {due.length === 0 ? (
              <p className="hi-sub">Everyone due an award this year has a request.</p>
            ) : (
              <ul className="wf-list">
                {due.map(({ e, years, option }) => (
                  <li key={e.staffId} className="wf-row">
                    <span>
                      <Award size={13} /> <strong>{e.fullName}</strong> · {years} years (joined {fmt(e.joinedDate)})
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={() => setCreating({ staffId: e.staffId, type: 'LONG_SERVICE', optionId: option })}>
                      Raise award
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card
        title="Welfare requests"
        sub={`Approve or decline, then pay through payroll (open period ${payrollOpenPeriod.label}) or straight from the welfare fund.`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCreating({})}>
            <Plus size={14} /> New request
          </button>
        }
      >
        <div className="digicraft-toolbar wf-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search ref, employee or entitlement" />
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'PENDING', label: 'Awaiting approval', n: n('PENDING') },
              { id: 'APPROVED', label: 'To pay', n: n('APPROVED') },
              { id: 'PAID', label: 'Paid', n: n('PAID') },
              { id: 'DECLINED', label: 'Declined', n: n('DECLINED') },
              { id: 'ALL', label: 'All', n: requests.length }
            ]}
          />
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Employee</th>
                <th>Beneficiary</th>
                <th className="num">Amount</th>
                <th>Documents</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={7}>No requests match.</Empty>}
              {pg.rows.map((r) => {
                const p = policyOf(r.type);
                const opt = p?.options.find((o) => o.id === r.optionId);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="wf-person">
                        <strong>{r.ref}</strong>
                        <span>
                          {p?.label ?? r.type} · {fmt(r.requestedOn)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Person id={r.staffId} name={org.name} />
                    </td>
                    <td>
                      {opt?.label ?? r.optionId}
                      {r.beneficiaryName && <div className="hi-sub">{r.beneficiaryName}</div>}
                    </td>
                    <td className="num hi-mono">{r.amount.toLocaleString()}</td>
                    <td className="wf-docs">{r.documents || <span className="hi-sub">None</span>}</td>
                    <td>
                      <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                      {r.status === 'PAID' && <div className="hi-sub">{r.paidVia === 'PAYROLL' ? `Payroll ${r.payPeriod}` : 'Welfare fund'} · {fmt(r.paidOn)}</div>}
                      {r.status === 'DECLINED' && r.reason && <div className="hi-sub">{r.reason}</div>}
                    </td>
                    <td className="wf-actions">
                      {r.status === 'PENDING' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => decideWelfareRequest(r.id, true)}>
                            <Check size={13} /> Approve
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setDeclining(r)}>
                            <X size={13} /> Decline
                          </button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <button className="btn btn-primary btn-sm" onClick={() => setPaying(r)}>
                          <Banknote size={13} /> Pay
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="requests" sizes={[10, 25, 50]} />
      </Card>

      {creating && <NewRequestModal initial={creating} onClose={() => setCreating(null)} />}
      {declining && <DeclineModal r={declining} onClose={() => setDeclining(null)} />}
      {paying && <PayModal r={paying} onClose={() => setPaying(null)} />}
    </>
  );
};

const PolicyTable: React.FC<{ editing: boolean }> = ({ editing }) => {
  const { welfarePolicies, setWelfarePolicyAmount } = useApp();
  return (
    <div className="hi-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Entitlement</th>
            <th>For</th>
            <th className="num">KES</th>
          </tr>
        </thead>
        <tbody>
          {welfarePolicies.flatMap((p) =>
            p.options.map((o, i) => (
              <tr key={`${p.type}-${o.id}`} className={i === 0 ? 'wf-group-start' : undefined}>
                {i === 0 && (
                  <td rowSpan={p.options.length}>
                    <strong>{p.label}</strong>
                    <div className="hi-sub">{p.documents}</div>
                    <div className="hi-sub">{p.note}</div>
                  </td>
                )}
                <td>{o.label}</td>
                <td className="num hi-mono">
                  {editing ? <input className="form-control wf-amount" type="number" min={0} step={500} value={o.amount} onChange={(ev) => setWelfarePolicyAmount(p.type, o.id, Number(ev.target.value))} aria-label={`${p.label} — ${o.label}`} /> : o.amount.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const NewRequestModal: React.FC<{ initial: { staffId?: string; type?: WelfareType; optionId?: string }; onClose: () => void }> = ({ initial, onClose }) => {
  const { welfarePolicies, addWelfareRequest } = useApp();
  const org = useWfOrg();
  const [staffId, setStaffId] = useState(initial.staffId ?? '');
  const [type, setType] = useState<WelfareType>(initial.type ?? 'BEREAVEMENT');
  const policy = welfarePolicies.find((p) => p.type === type);
  const [optionId, setOptionId] = useState(initial.optionId ?? policy?.options[0]?.id ?? '');
  const [beneficiaryName, setBeneficiary] = useState('');
  const [documents, setDocuments] = useState(initial.type === 'LONG_SERVICE' ? 'Service record (automatic)' : '');
  const option = policy?.options.find((o) => o.id === optionId);
  const needsName = optionId === 'SPOUSE' || optionId === 'CHILD' || optionId === 'PARENT';
  const emp = org.byId.get(staffId);
  const nok = emp?.nextOfKins?.map((k) => `${k.name} (${k.relationship})`) ?? [];

  return (
    <Modal
      title="New welfare request"
      subtitle="Amount follows the entitlement policy"
      onClose={onClose}
      width={640}
      footer={
        <button
          className="btn btn-primary"
          disabled={!staffId || !option || (needsName && !beneficiaryName.trim())}
          onClick={() => {
            if (addWelfareRequest({ staffId, type, optionId, beneficiaryName: beneficiaryName.trim() || undefined, documents: documents.trim() })) onClose();
          }}
        >
          Submit request
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Employee">
          <StaffSelect value={staffId} onChange={setStaffId} staff={org.staff} />
        </Field>
        <Field label="Entitlement">
          <select
            className="form-control"
            value={type}
            onChange={(ev) => {
              const t = ev.target.value as WelfareType;
              setType(t);
              setOptionId(welfarePolicies.find((p) => p.type === t)?.options[0]?.id ?? '');
            }}
          >
            {welfarePolicies.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="For">
          <select className="form-control" value={optionId} onChange={(ev) => setOptionId(ev.target.value)}>
            {policy?.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} — {kes(o.amount)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input className="form-control" disabled value={option ? kes(option.amount) : '—'} />
        </Field>
        {needsName && (
          <Field label="Beneficiary name" wide hint={nok.length ? `On record: ${nok.join(', ')}` : 'No next of kin on record for this employee'}>
            <input className="form-control" value={beneficiaryName} onChange={(ev) => setBeneficiary(ev.target.value)} placeholder="Name and relationship" />
          </Field>
        )}
        <Field label="Supporting documents" wide hint={policy ? `Needed: ${policy.documents}` : undefined}>
          <input className="form-control" value={documents} onChange={(ev) => setDocuments(ev.target.value)} placeholder="e.g. Burial permit no. 0045812" />
        </Field>
      </div>
      {policy && <p className="hi-sub">{policy.note}</p>}
    </Modal>
  );
};

const DeclineModal: React.FC<{ r: WelfareRequest; onClose: () => void }> = ({ r, onClose }) => {
  const { decideWelfareRequest } = useApp();
  const org = useWfOrg();
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={`Decline ${r.ref}`}
      subtitle={`${org.name(r.staffId)} · ${kes(r.amount)}`}
      onClose={onClose}
      width={520}
      footer={
        <button className="btn btn-primary" disabled={!reason.trim()} onClick={() => {
            if (decideWelfareRequest(r.id, false, reason)) onClose();
          }}>
          Decline request
        </button>
      }
    >
      <Field label="Reason (shared with the employee)">
        <textarea className="form-control" rows={3} value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus />
      </Field>
    </Modal>
  );
};

const PayModal: React.FC<{ r: WelfareRequest; onClose: () => void }> = ({ r, onClose }) => {
  const { payWelfareRequest, payrollOpenPeriod, welfarePolicies } = useApp();
  const org = useWfOrg();
  const fund = useWelfareFund();
  const [via, setVia] = useState<'PAYROLL' | 'FUND'>(r.type === 'LONG_SERVICE' ? 'PAYROLL' : 'FUND');
  const label = welfarePolicies.find((p) => p.type === r.type)?.label ?? r.type;
  const component = r.type === 'LONG_SERVICE' ? 'Long-service award (taxable)' : 'Expense reimbursement (not taxed)';
  return (
    <Modal
      title={`Pay ${r.ref}`}
      subtitle={`${label} · ${org.name(r.staffId)} · ${kes(r.amount)}`}
      onClose={onClose}
      width={560}
      footer={
        <button className="btn btn-primary" onClick={() => {
            if (payWelfareRequest(r.id, via)) onClose();
          }}>
          <Banknote size={14} /> {via === 'PAYROLL' ? `Post to ${payrollOpenPeriod.label} payroll` : 'Record fund payment'}
        </button>
      }
    >
      <div className="wf-choice">
        <label className={via === 'PAYROLL' ? 'active' : ''}>
          <input type="radio" name="via" checked={via === 'PAYROLL'} onChange={() => setVia('PAYROLL')} />
          <div>
            <strong>Through payroll</strong>
            <span>
              One-off earning “{component}” on the {payrollOpenPeriod.label} payslip, reference {r.ref}.
            </span>
          </div>
        </label>
        <label className={via === 'FUND' ? 'active' : ''}>
          <input type="radio" name="via" checked={via === 'FUND'} onChange={() => setVia('FUND')} disabled={r.type === 'LONG_SERVICE'} />
          <div>
            <strong>From the welfare fund</strong>
            <span>{r.type === 'LONG_SERVICE' ? 'Long-service awards are paid by the company through payroll.' : `Paid by the fund treasurer; nothing goes to payroll.${fund ? ` Fund balance ${kes(fund.balance)}.` : ''}`}</span>
          </div>
        </label>
      </div>
    </Modal>
  );
};
