import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, RefreshCw, ClipboardList } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { OutsourcedDraft } from '../../../context/peopleState';
import { usePaged, Pager } from '../../../components/common/Pager';
import { addMonths, fmtDate, todayIso } from '../../../data/hireEngine';
import { daysTo, expectedInvoice, monthRel, OUTSOURCE_SERVICES, RATE_BASIS_LABEL, type OutsourcedContract, type RateBasis } from '../../../data/peopleSeed';
import { Card, Empty, Field, Modal, Pill, Stat } from '../hire/shared';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
const statusOf = (c: OutsourcedContract, today: string) => {
  const d = daysTo(c.end, today);
  return d < 0 ? ({ label: `Expired ${-d} days ago`, tone: 'danger' } as const) : d <= 60 ? ({ label: `Ends in ${d} days`, tone: 'warning' } as const) : ({ label: 'Active', tone: 'success' } as const);
};

export const OutsourcedTab: React.FC = () => {
  const { outsourcedContracts, selectedOrgId } = useApp();
  const [service, setService] = useState<'All' | OutsourcedContract['service']>('All');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: 'contract' | 'month' | 'renew'; c?: OutsourcedContract } | null>(null);
  const today = todayIso();

  const mine = useMemo(() => outsourcedContracts.filter((c) => c.orgId === selectedOrgId), [outsourcedContracts, selectedOrgId]);
  const last = monthRel(-1);
  const lastNumbers = mine.reduce((s, c) => s + (c.months.find((m) => m.month === last)?.numbers ?? 0), 0);
  const sixMonths = new Set([-6, -5, -4, -3, -2, -1].map(monthRel));
  const invoiced = mine.reduce((s, c) => s + c.months.filter((m) => sixMonths.has(m.month)).reduce((t, m) => t + m.invoiceKes, 0), 0);
  const alerts = mine.filter((c) => daysTo(c.end, today) <= 60).sort((a, b) => a.end.localeCompare(b.end));
  const services = [...new Set(mine.map((c) => c.service))];

  const q = search.trim().toLowerCase();
  const rows = mine.filter((c) => (service === 'All' || c.service === service) && (!q || `${c.contractor} ${c.site} ${c.contactName} ${c.id}`.toLowerCase().includes(q))).sort((a, b) => a.contractor.localeCompare(b.contractor));
  const pg = usePaged(rows, 10, `${service}|${q}|${selectedOrgId}`);
  const selected = mine.find((c) => c.id === selectedId) ?? null;

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Contracts" value={mine.length} sub={`${mine.filter((c) => daysTo(c.end, today) >= 0).length} in force`} />
        <Stat label={`Engaged in ${fmtDate(last)}`} value={lastNumbers.toLocaleString()} sub="Guards, cleaners, pluckers and drivers on site" />
        <Stat label="Invoiced, last 6 months" value={kes(invoiced)} sub="From the monthly returns" />
        <Stat label="Expiring in 60 days" value={alerts.length} sub="Renew or re-tender in time" tone={alerts.length ? '#d97706' : undefined} />
      </div>

      {alerts.length > 0 && (
        <Card title="Expiry alerts" sub="Contracts that have lapsed or end within 60 days. Workers on an expired contract have no cover for WIBA or site access.">
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Service</th>
                  <th>Ends</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((c) => {
                  const st = statusOf(c, today);
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.contractor}</strong>
                        <div className="hi-sub">{c.site}</div>
                      </td>
                      <td>{c.service}</td>
                      <td>
                        {fmtDate(c.end)}
                        <div>
                          <Pill tone={st.tone}>{st.label}</Pill>
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'renew', c })}>
                          <RefreshCw size={13} /> Renew
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Contractors"
        sub="Labour supplied by outside firms. These workers are not on the payroll; record each month's numbers and the invoice so costs and headcount stay visible."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'contract' })}>
            <Plus size={14} /> Add contract
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by contractor, site or contact..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {(['All', ...services] as const).map((k) => (
              <button key={k} className={`digicraft-filter-pill ${service === k ? 'active' : ''}`} onClick={() => setService(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Contractor</th>
                <th>Service and site</th>
                <th>Contract</th>
                <th>Rate</th>
                <th>Last month</th>
                <th>Contact</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No contracts for this company.</Empty>}
              {pg.rows.map((c) => {
                const st = statusOf(c, today);
                const m = c.months[c.months.length - 1];
                return (
                  <tr key={c.id} style={selectedId === c.id ? { background: 'var(--brand-subtle)' } : undefined}>
                    <td>
                      <button className="hi-link" onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}>
                        {c.contractor}
                      </button>
                      <div className="hi-sub hi-mono">{c.id}</div>
                    </td>
                    <td className="hi-wrap">
                      <strong>{c.service}</strong>
                      <div className="hi-sub">{c.site}</div>
                    </td>
                    <td>
                      {fmtDate(c.start)} – {fmtDate(c.end)}
                      <div>
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </div>
                    </td>
                    <td>
                      {kes(c.rateKes)}
                      <div className="hi-sub">
                        {RATE_BASIS_LABEL[c.rateBasis]} · {c.agreedHeads} agreed
                      </div>
                    </td>
                    <td>
                      {m ? (
                        <>
                          {m.numbers} engaged
                          <div className="hi-sub">
                            {fmtDate(m.month)} · {kes(m.invoiceKes)}
                          </div>
                        </>
                      ) : (
                        <span className="hi-sub">Nothing recorded</span>
                      )}
                    </td>
                    <td>
                      {c.contactName}
                      <div className="hi-sub">{c.contactPhone}</div>
                    </td>
                    <td>
                      <div className="hi-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'month', c })} title="Record a month's numbers">
                          <ClipboardList size={13} /> Numbers
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'renew', c })} title="Renew">
                          <RefreshCw size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'contract', c })} aria-label="Edit">
                          <Pencil size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="contracts" />
      </Card>

      {selected ? <MonthsCard c={selected} onRecord={() => setModal({ kind: 'month', c: selected })} /> : mine.length > 0 && <div className="pr-note">Choose a contractor above to see their monthly numbers and invoices.</div>}

      {modal?.kind === 'contract' && <ContractModal c={modal.c} onClose={() => setModal(null)} />}
      {modal?.kind === 'month' && modal.c && <MonthModal c={modal.c} onClose={() => setModal(null)} />}
      {modal?.kind === 'renew' && modal.c && <RenewModal c={modal.c} onClose={() => setModal(null)} />}
    </>
  );
};

const MonthsCard: React.FC<{ c: OutsourcedContract; onRecord: () => void }> = ({ c, onRecord }) => {
  const months = [...c.months].reverse();
  const pg = usePaged(months, 12, c.id);
  const total = c.months.reduce((s, m) => s + m.invoiceKes, 0);
  return (
    <Card
      title={`${c.contractor} — monthly numbers`}
      sub={`${c.service} at ${c.site}. Invoice checked against the agreed rate of ${kes(c.rateKes)} ${RATE_BASIS_LABEL[c.rateBasis]}.`}
      actions={
        <button className="btn btn-primary btn-sm" onClick={onRecord}>
          <Plus size={14} /> Record month
        </button>
      }
    >
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Engaged</th>
              <th>Man-days</th>
              <th>Invoice</th>
              <th>At contract rate</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={6}>No months recorded yet.</Empty>}
            {pg.rows.map((m) => {
              const exp = expectedInvoice(c, m.numbers, m.manDays);
              const diff = m.invoiceKes - exp;
              return (
                <tr key={m.month}>
                  <td>{fmtDate(m.month)}</td>
                  <td>
                    {m.numbers}
                    {m.numbers > c.agreedHeads && <div className="hi-sub hi-neg">Above the {c.agreedHeads} agreed</div>}
                  </td>
                  <td>{m.manDays.toLocaleString()}</td>
                  <td>
                    {kes(m.invoiceKes)}
                    {m.invoiceNo && <div className="hi-sub hi-mono">{m.invoiceNo}</div>}
                  </td>
                  <td>
                    {kes(exp)}
                    {diff !== 0 && <div className={`hi-sub ${diff > 0 ? 'hi-neg' : ''}`}>{diff > 0 ? `${kes(diff)} over — query it` : `${kes(-diff)} under`}</div>}
                  </td>
                  <td className="hi-sub">
                    {m.recordedBy}
                    <div>{fmtDate(m.recordedOn)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="months" sizes={[12, 24]} />
      <div className="hi-sub" style={{ marginTop: 8 }}>
        {c.months.length} months on file · {kes(total)} invoiced in total
        {c.renewals.length > 0 && ` · renewed ${c.renewals.map((r) => `${fmtDate(r.on)} (to ${fmtDate(r.newEnd)}, by ${r.by})`).join('; ')}`}
      </div>
    </Card>
  );
};

const ContractModal: React.FC<{ c?: OutsourcedContract; onClose: () => void }> = ({ c, onClose }) => {
  const { saveOutsourcedContract, activeTenant } = useApp();
  const [d, setD] = useState<OutsourcedDraft>(
    c ?? { contractor: '', service: 'Security', start: todayIso(), end: addMonths(todayIso(), 12), rateKes: 0, rateBasis: 'HEAD_MONTH', agreedHeads: 1, site: activeTenant.name, contactName: '', contactPhone: '' }
  );
  const set = (patch: Partial<OutsourcedDraft>) => setD((x) => ({ ...x, ...patch }));
  return (
    <Modal
      title={c ? 'Edit contract' : 'Add contract'}
      subtitle="Attach the signed contract and the contractor's NSSF, WIBA and KRA compliance certificates to the file."
      width={700}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => saveOutsourcedContract(d, c?.id) && onClose()}>
            Save contract
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Contractor" wide>
          <input className="form-control" value={d.contractor} onChange={(e) => set({ contractor: e.target.value })} placeholder="Registered company name" />
        </Field>
        <Field label="Service">
          <select className="form-control" value={d.service} onChange={(e) => set({ service: e.target.value as OutsourcedDraft['service'] })}>
            {OUTSOURCE_SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Site / branch">
          <input className="form-control" value={d.site} onChange={(e) => set({ site: e.target.value })} />
        </Field>
        <Field label="Starts">
          <input type="date" className="form-control" value={d.start} onChange={(e) => set({ start: e.target.value })} />
        </Field>
        <Field label="Ends">
          <input type="date" className="form-control" value={d.end} min={d.start} onChange={(e) => set({ end: e.target.value })} />
        </Field>
        <Field label="Rate (KES)">
          <input type="number" className="form-control" min={0} value={d.rateKes || ''} onChange={(e) => set({ rateKes: Number(e.target.value) })} />
        </Field>
        <Field label="Charged">
          <select className="form-control" value={d.rateBasis} onChange={(e) => set({ rateBasis: e.target.value as RateBasis })}>
            {(Object.keys(RATE_BASIS_LABEL) as RateBasis[]).map((k) => (
              <option key={k} value={k}>
                {RATE_BASIS_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agreed headcount">
          <input type="number" className="form-control" min={0} value={d.agreedHeads} onChange={(e) => set({ agreedHeads: Number(e.target.value) })} />
        </Field>
        <Field label="Contact person">
          <input className="form-control" value={d.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        </Field>
        <Field label="Contact phone">
          <input className="form-control" value={d.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+254 7.." />
        </Field>
      </div>
    </Modal>
  );
};

const MonthModal: React.FC<{ c: OutsourcedContract; onClose: () => void }> = ({ c, onClose }) => {
  const { recordOutsourcedMonth } = useApp();
  const recorded = new Set(c.months.map((m) => m.month));
  const firstOpen = [-1, 0, -2, -3].map(monthRel).find((m) => !recorded.has(m)) ?? monthRel(0);
  const [month, setMonth] = useState(firstOpen);
  const prev = c.months.find((m) => m.month === month);
  const [numbers, setNumbers] = useState(prev?.numbers ?? c.agreedHeads);
  const [manDays, setManDays] = useState(prev?.manDays ?? c.agreedHeads * 26);
  const [invoice, setInvoice] = useState(prev?.invoiceKes ?? 0);
  const [invoiceNo, setInvoiceNo] = useState(prev?.invoiceNo ?? '');
  const exp = expectedInvoice(c, numbers, manDays);
  return (
    <Modal
      title="Record month's numbers"
      subtitle={`${c.contractor} · ${c.service}`}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => recordOutsourcedMonth(c.id, { month, numbers, manDays, invoiceKes: invoice || exp, invoiceNo: invoiceNo.trim() || undefined }) && onClose()}>
            Save
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Month" hint={recorded.has(month) ? 'Already recorded — saving replaces it' : undefined}>
          <input
            type="month"
            className="form-control"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              // Load what is already on file for that month
              const had = c.months.find((m) => m.month === e.target.value);
              if (had) {
                setNumbers(had.numbers);
                setManDays(had.manDays);
                setInvoice(had.invoiceKes);
                setInvoiceNo(had.invoiceNo ?? '');
              }
            }}
          />
        </Field>
        <Field label="Workers engaged">
          <input type="number" className="form-control" min={0} value={numbers} onChange={(e) => setNumbers(Number(e.target.value))} />
        </Field>
        <Field label="Man-days">
          <input type="number" className="form-control" min={0} value={manDays} onChange={(e) => setManDays(Number(e.target.value))} />
        </Field>
        <Field label="Invoice amount (KES)" hint={`At the contract rate: ${kes(exp)}`}>
          <input type="number" className="form-control" min={0} value={invoice || ''} placeholder={String(exp)} onChange={(e) => setInvoice(Number(e.target.value))} />
        </Field>
        <Field label="Invoice no." wide>
          <input className="form-control hi-mono" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const RenewModal: React.FC<{ c: OutsourcedContract; onClose: () => void }> = ({ c, onClose }) => {
  const { renewOutsourcedContract } = useApp();
  const [end, setEnd] = useState(addMonths(c.end, 12));
  const [rate, setRate] = useState(c.rateKes);
  return (
    <Modal
      title="Renew contract"
      subtitle={`${c.contractor} · now ends ${fmtDate(c.end)}`}
      width={520}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => renewOutsourcedContract(c.id, end, rate) && onClose()}>
            Renew
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="New end date">
          <input type="date" className="form-control" value={end} min={c.end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label={`Rate (KES, ${RATE_BASIS_LABEL[c.rateBasis]})`} hint={rate !== c.rateKes ? `${rate > c.rateKes ? '+' : ''}${(((rate - c.rateKes) / c.rateKes) * 100).toFixed(1)}% on ${kes(c.rateKes)}` : 'Same rate'}>
          <input type="number" className="form-control" min={0} value={rate || ''} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
      </div>
    </Modal>
  );
};
