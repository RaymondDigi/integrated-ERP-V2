import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Printer, RefreshCw, Search, Wallet, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { ImprestDraft } from '../../../context/travelState';
import { usePaged, Pager } from '../../../components/common/Pager';
import { addDays } from '../../../data/hireEngine';
import { IMPREST_KIND, linesOf, overdueDays, PETTY_CASH_LIMIT, type Imprest, type ImprestKind } from '../../../data/travelEngine';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { blankImprestLine, draftTotal, ImprestLinesEditor, ImprestLinesTable } from './ImprestLines';
import { Card, EmpCell, Empty, Field, fmt, ImprestPill, kes, Modal, PersonSelect, Pill, Timeline, useTravelOrg } from './shared';

const NewRequisition: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { requestImprest, imprestBlock, travelToday } = useApp();
  const { staff, byId } = useTravelOrg();
  const [f, setF] = useState<ImprestDraft>({ staffId: '', kind: 'PETTY_CASH', purpose: '', costCentre: '', lines: [blankImprestLine(), blankImprestLine()], dueOn: addDays(travelToday, 14) });
  const [error, setError] = useState('');
  const set = (p: Partial<ImprestDraft>) => setF((x) => ({ ...x, ...p }));
  const block = f.staffId ? imprestBlock(f.staffId) : undefined;
  const depts = [...new Set(staff.map((e) => e.department))].sort();
  const total = draftTotal(f.lines);
  const over = f.kind === 'PETTY_CASH' && total > PETTY_CASH_LIMIT;
  const defaultCc = f.costCentre || byId.get(f.staffId)?.department || '';
  const save = () => {
    const res = requestImprest({ ...f, costCentre: defaultCc, lines: f.lines.map((l) => ({ ...l, costCentre: l.costCentre || defaultCc })), dueOn: f.kind === 'STANDALONE' ? f.dueOn : undefined });
    if (!res.ok) return setError(res.reason ?? 'Could not save.');
    onClose();
  };
  return (
    <Modal
      title="New petty cash or imprest request"
      subtitle={`Petty cash is for small purchases up to ${kes(PETTY_CASH_LIMIT)}, paid from the float. Larger amounts go as an imprest by bank.`}
      onClose={onClose}
      width={980}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!!block || over || total <= 0}>
            Submit {kes(total)} for approval
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Type">
          <select className="form-control" value={f.kind} onChange={(ev) => set({ kind: ev.target.value as ImprestDraft['kind'] })}>
            <option value="PETTY_CASH">Petty cash (up to {kes(PETTY_CASH_LIMIT)})</option>
            <option value="STANDALONE">Imprest (not linked to travel)</option>
          </select>
        </Field>
        <Field label="Employee">
          <PersonSelect value={f.staffId} onChange={(v) => set({ staffId: v, costCentre: byId.get(v)?.department ?? '' })} people={staff} />
        </Field>
        <Field label="Purpose" wide>
          <input className="form-control" value={f.purpose} placeholder="e.g. Office supplies and vehicle running for the week" onChange={(ev) => set({ purpose: ev.target.value })} />
        </Field>
        <Field label="Default cost centre" hint="Used for new lines; each line can be charged elsewhere">
          <select className="form-control" value={f.costCentre} onChange={(ev) => set({ costCentre: ev.target.value })}>
            <option value="">Employee's department</option>
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        {f.kind === 'STANDALONE' && (
          <Field label="Surrender by" hint="Receipts and any balance due back by this date">
            <input className="form-control" type="date" value={f.dueOn} min={travelToday} onChange={(ev) => set({ dueOn: ev.target.value })} />
          </Field>
        )}
      </div>
      <h4 className="trv-h4">Items</h4>
      <ImprestLinesEditor lines={f.lines} onChange={(lines) => set({ lines })} costCentres={depts} defaultCostCentre={defaultCc} limit={f.kind === 'PETTY_CASH' ? PETTY_CASH_LIMIT : undefined} />
      {over && <div className="pr-note bad">Over the petty cash limit of {kes(PETTY_CASH_LIMIT)} a request — choose Imprest instead.</div>}
      {block && (
        <div className="pr-note bad">
          <AlertTriangle size={13} /> Blocked: {block}
        </div>
      )}
      {error && <div className="pr-note bad">{error}</div>}
    </Modal>
  );
};

const Detail: React.FC<{ i: Imprest; onClose: () => void }> = ({ i, onClose }) => {
  const { decideImprest, payImprest, travelToday, activeTenant } = useApp();
  const { name } = useTravelOrg();
  const lines = linesOf(i);
  const [allowed, setAllowed] = useState(() => lines.map((l) => l.amount));
  const [printing, setPrinting] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const pay = () => {
    const res = payImprest(i.id);
    if (!res.ok) return setError(res.reason ?? 'Could not pay.');
    onClose();
  };
  return (
    <Modal title={`${i.id} — ${IMPREST_KIND[i.kind]}`} subtitle={i.purpose} onClose={onClose} width={900}>
      <div className="pr-kv">
        <div>
          <span>Employee</span>
          <strong>{name(i.staffId)}</strong>
          <small>{i.staffId}</small>
        </div>
        <div>
          <span>Amount</span>
          <strong>{kes(i.amount)}</strong>
          {i.requestedAmount !== undefined && i.requestedAmount !== i.amount && <small>of {kes(i.requestedAmount)} asked</small>}
          <small>{i.paidFrom === 'FLOAT' ? 'From petty cash float' : i.paidFrom === 'BANK' ? 'By bank' : i.kind === 'PETTY_CASH' ? 'Float' : 'Bank'}</small>
        </div>
        <div>
          <span>Cost centre</span>
          <strong>{i.costCentre}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>
            <ImprestPill i={i} today={travelToday} />
          </strong>
          {i.dueOn && i.status === 'PAID' && <small>Surrender by {fmt(i.dueOn)}</small>}
        </div>
      </div>
      <h4 className="trv-h4">
        Items ({lines.length}){' '}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setPrinting(true)}>
          <Printer size={13} /> {i.kind === 'PETTY_CASH' ? 'Petty cash voucher' : 'Imprest warrant'}
        </button>
      </h4>
      <ImprestLinesTable lines={lines} allowed={i.status === 'PENDING' ? allowed : undefined} onAllowed={i.status === 'PENDING' ? setAllowed : undefined} />
      {i.status === 'PENDING' && allowed.reduce((n, a) => n + a, 0) < lines.reduce((n, l) => n + l.amount, 0) && (
        <div className="pr-note warn">Approving {kes(allowed.reduce((n, a) => n + a, 0))} of {kes(lines.reduce((n, l) => n + l.amount, 0))} — say why in the comment.</div>
      )}
      {printing && <Voucher i={i} company={activeTenant.name} name={name} onClose={() => setPrinting(false)} />}
      {i.status === 'PENDING' && (
        <>
          <Field label={`Decision — ${name(i.approverId)}`} wide>
            <input className="form-control" value={comment} placeholder="Comment (optional)" onChange={(ev) => setComment(ev.target.value)} />
          </Field>
          <div className="hi-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                decideImprest(i.id, false, comment);
                onClose();
              }}
            >
              <XCircle size={14} /> Decline
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                decideImprest(i.id, true, comment, undefined, allowed);
                onClose();
              }}
            >
              <CheckCircle2 size={14} /> Approve
            </button>
          </div>
        </>
      )}
      {i.status === 'APPROVED' && (
        <div className="hi-actions">
          <button className="btn btn-primary btn-sm" onClick={pay}>
            <Wallet size={14} /> Pay {kes(i.amount)} {i.kind === 'PETTY_CASH' ? 'from the float' : 'by bank'}
          </button>
        </div>
      )}
      {error && <div className="pr-note bad">{error}</div>}
      <h4 className="trv-h4">Timeline</h4>
      <Timeline events={i.events} />
    </Modal>
  );
};

/** Printable petty cash voucher / imprest warrant with every line and signature boxes. */
const Voucher: React.FC<{ i: Imprest; company: string; name: (id?: string) => string; onClose: () => void }> = ({ i, company, name, onClose }) => {
  const lines = linesOf(i);
  const decided = i.status !== 'PENDING' && i.status !== 'DECLINED';
  const report: Report = {
    title: i.kind === 'PETTY_CASH' ? 'Petty Cash Voucher' : 'Imprest Warrant',
    subtitle: `${i.id} · ${fmt(i.requestedOn)}`,
    kpis: [
      { label: 'Payee', value: name(i.staffId), sub: i.staffId },
      { label: 'Purpose', value: i.purpose },
      { label: 'Amount', value: kes(i.amount), sub: i.requestedAmount && i.requestedAmount !== i.amount ? `of ${kes(i.requestedAmount)} asked` : undefined },
      { label: 'Paid', value: i.paidOn ? fmt(i.paidOn) : 'Not yet', sub: i.paidFrom === 'FLOAT' ? 'Petty cash float' : i.paidFrom === 'BANK' ? 'Bank' : undefined }
    ],
    sections: [
      {
        heading: 'Items',
        columns: [{ label: '#' }, { label: 'Item' }, { label: 'Category' }, { label: 'Cost centre' }, { label: 'Qty', num: true }, { label: 'Unit cost', num: true }, { label: 'Amount', num: true }, ...(decided ? [{ label: 'Approved', num: true }] : [])],
        rows: lines.map((l, k) => [String(k + 1), l.description, l.category, l.costCentre, l.quantity, l.unitCost, l.amount, ...(decided ? [l.approved ?? l.amount] : [])]),
        foot: ['', 'Total', '', '', '', '', lines.reduce((n, l) => n + l.amount, 0), ...(decided ? [i.amount] : [])]
      }
    ],
    footnote: i.kind === 'PETTY_CASH' ? 'Receipts for every line are due within 3 days of payment; change goes back into the float.' : `Surrender with receipts by ${i.dueOn ? fmt(i.dueOn) : 'the agreed date'}. Unsurrendered balances are recovered through payroll.`,
    signatures: [`Requested: ${name(i.staffId)}`, `Approved: ${name(i.approverId)}`, 'Paid by (cashier)', 'Received by']
  };
  return (
    <Modal title={report.title} subtitle="Print and sign" onClose={onClose} width={900}>
      <ReportPaper report={report} company={company} />
    </Modal>
  );
};

/** Petty cash requisitions, imprest advances, the float and what each employee still owes. */
export const ImprestTab: React.FC = () => {
  const { imprests, pettyCashFloat: fl, replenishPettyCash, travelToday, selectedOrgId } = useApp();
  const { name } = useTravelOrg();
  const [kind, setKind] = useState<'all' | ImprestKind>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      imprests
        .filter((i) => kind === 'all' || i.kind === kind)
        .filter((i) => !q || `${i.id} ${name(i.staffId)} ${i.staffId} ${i.purpose} ${i.costCentre} ${(i.lines ?? []).map((l) => l.description).join(' ')}`.toLowerCase().includes(q))
        .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn) || b.id.localeCompare(a.id)),
    [imprests, kind, q, name]
  );
  const pg = usePaged(rows, 10, `${kind}|${q}|${selectedOrgId}`);
  const mv = usePaged([...fl.movements].reverse(), 5, selectedOrgId);
  const open = imprests.find((i) => i.id === openId);

  // Outstanding per employee, oldest first
  const owing = useMemo(() => {
    const m = new Map<string, Imprest[]>();
    imprests.filter((i) => i.status === 'PAID').forEach((i) => m.set(i.staffId, [...(m.get(i.staffId) ?? []), i]));
    return [...m.entries()]
      .map(([staffId, list]) => ({ staffId, list, total: list.reduce((n, i) => n + i.amount, 0), late: Math.max(...list.map((i) => overdueDays(i, travelToday))) }))
      .sort((a, b) => b.late - a.late || b.total - a.total);
  }, [imprests, travelToday]);
  const pct = fl.limit ? Math.round((fl.balance / fl.limit) * 100) : 0;

  return (
    <>
      <div className="hi-two">
        <Card
          title="Petty cash float"
          sub={`Imprest system: the float is topped back up to ${kes(fl.limit)} from the bank.`}
          actions={
            <button className="btn btn-secondary btn-sm" onClick={() => replenishPettyCash()} disabled={fl.toReplenish <= 0}>
              <RefreshCw size={14} /> Replenish {kes(fl.toReplenish)}
            </button>
          }
        >
          <div className="pr-kv">
            <div>
              <span>Cash in the box</span>
              <strong style={{ color: pct < 25 ? 'var(--status-critical)' : undefined }}>{kes(fl.balance)}</strong>
              <small>{pct}% of the float</small>
            </div>
            <div>
              <span>Paid out since top-up</span>
              <strong>{kes(fl.toReplenish)}</strong>
              <small>Backed by vouchers</small>
            </div>
          </div>
          <div className={`hi-bar ${pct < 25 ? 'danger' : pct < 50 ? 'warning' : 'success'}`} style={{ marginTop: 10 }}>
            <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <table className="hr-table" style={{ marginTop: 10 }}>
            <tbody>
              {mv.rows.map((m) => (
                <tr key={m.id}>
                  <td className="hi-sub">{fmt(m.on)}</td>
                  <td>
                    {m.kind === 'ISSUE' ? 'Paid out' : m.kind === 'REFUND' ? 'Change returned' : m.kind === 'REPLENISH' ? 'Replenished' : 'Opening float'}
                    <div className="hi-sub">
                      {m.ref}
                      {m.note ? ` · ${m.note}` : ''}
                    </div>
                  </td>
                  <td className={`hi-num ${m.kind === 'ISSUE' ? 'hi-neg' : ''}`}>{m.kind === 'ISSUE' ? `−${m.amount.toLocaleString()}` : `+${m.amount.toLocaleString()}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager p={mv} noun="movements" sizes={[5, 10, 25]} />
        </Card>

        <Card title="Outstanding by employee" sub="Unsurrendered petty cash, imprest and travel advances. Anyone past their surrender date can't take a new advance.">
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="hi-num">Outstanding</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {owing.length === 0 && <Empty cols={3}>Nothing outstanding.</Empty>}
                {owing.map((o) => (
                  <tr key={o.staffId}>
                    <td>
                      <EmpCell staffId={o.staffId} sub={o.list.map((i) => i.id).join(', ')} />
                    </td>
                    <td className="hi-num">{kes(o.total)}</td>
                    <td>
                      {o.late > 0 ? (
                        <Pill tone="danger" title="Blocked from new advances">
                          {o.late} days overdue · blocked
                        </Pill>
                      ) : (
                        <Pill tone="primary">Not yet due</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title="Requisitions and advances"
        sub="Approved by the line manager; Finance pays petty cash from the float and imprest by bank."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> New request
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by employee, purpose, cost centre or reference..." value={search} onChange={(ev) => setSearch(ev.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {(['all', 'PETTY_CASH', 'STANDALONE', 'TRAVEL'] as const).map((k) => (
              <button key={k} className={`digicraft-filter-pill ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {k === 'all' ? 'All' : IMPREST_KIND[k]} ({imprests.filter((i) => k === 'all' || i.kind === k).length})
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Employee</th>
                <th>Purpose</th>
                <th>Cost centre</th>
                <th className="hi-num">Amount</th>
                <th>Requested</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>Nothing matches.</Empty>}
              {pg.rows.map((i) => (
                <tr key={i.id} className="hi-click" onClick={() => setOpenId(i.id)}>
                  <td className="hi-mono">
                    {i.id}
                    <div className="hi-sub">{IMPREST_KIND[i.kind]}</div>
                  </td>
                  <td>
                    <EmpCell staffId={i.staffId} />
                  </td>
                  <td className="hi-wrap">
                    {i.purpose}
                    {i.travelId && <div className="hi-sub">Linked to {i.travelId}</div>}
                    {(i.lines?.length ?? 0) > 1 && <div className="hi-sub">{i.lines!.length} items: {i.lines!.map((l) => l.description).join(', ')}</div>}
                  </td>
                  <td className="hi-sub">{i.costCentre}</td>
                  <td className="hi-num">{kes(i.amount)}</td>
                  <td className="hi-sub">{fmt(i.requestedOn)}</td>
                  <td>
                    <ImprestPill i={i} today={travelToday} />
                    {i.status === 'PENDING' && <div className="hi-sub">with {name(i.approverId)}</div>}
                    {i.status === 'PAID' && i.dueOn && <div className="hi-sub">due {fmt(i.dueOn)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="items" sizes={[10, 25, 50]} />
      </Card>

      {adding && <NewRequisition onClose={() => setAdding(false)} />}
      {open && <Detail key={open.id + open.status} i={open} onClose={() => setOpenId('')} />}
    </>
  );
};
