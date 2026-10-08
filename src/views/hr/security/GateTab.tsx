import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, Plus, Printer, Search, Undo2, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { useApprovers } from '../hire/shared';
import { PASS_TYPES, awaitsReturn, daysBetween, hasDiscrepancy, isOverdue, isOverstay, plusDays, type GatePass, type PassItem, type PassType } from '../../../data/securitySeed';
import { Card, Empty, Field, GuardInput, Modal, PersonSelect, Pill, Stat, fmt, fmtStamp, useNow, useSecOrg, type Tone } from './shared';
import { GoodsInCard } from './GoodsInCard';
import { VisitorsCard } from './VisitorsCard';

const FILTERS = ['All', 'Awaiting approval', 'Ready at gate', 'Out — to return', 'Overdue', 'Discrepancies', 'Closed'] as const;
type Filter = (typeof FILTERS)[number];

const statusTone = (p: GatePass, today: string): Tone => {
  if (isOverdue(p, today)) return 'danger';
  if (p.status === 'Awaiting approval') return 'warning';
  if (p.status === 'Approved') return 'info';
  if (p.status === 'Rejected' || p.status === 'Cancelled') return 'danger';
  if (p.status === 'Exited' && awaitsReturn(p)) return 'primary';
  return 'success';
};

const itemsSummary = (items: PassItem[]) => items.map((i) => `${i.qty.toLocaleString()} ${i.unit} ${i.desc}`).join('; ');

/** OSH › Gate Passes & Visitors: goods in and out, gate checks, returnables, incoming deliveries and the visitor log. */
export const GateTab: React.FC = () => {
  const { gatePasses, visitors, goodsReceipts, cancelGatePass } = useApp();
  const { orgId, today, name } = useSecOrg();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [raising, setRaising] = useState(false);
  const [deciding, setDeciding] = useState<GatePass | null>(null);
  const [checking, setChecking] = useState<GatePass | null>(null);
  const [returning, setReturning] = useState<GatePass | null>(null);
  const [printing, setPrinting] = useState<GatePass | null>(null);

  const mine = useMemo(() => gatePasses.filter((p) => p.orgId === orgId), [gatePasses, orgId]);
  const month = today.slice(0, 7);
  const awaiting = mine.filter((p) => p.status === 'Awaiting approval').length;
  const out = mine.filter(awaitsReturn);
  const overdue = out.filter((p) => isOverdue(p, today));
  const onSite = visitors.filter((v) => v.orgId === orgId && v.checkIn && !v.checkOut);
  const overstays = onSite.filter((v) => isOverstay(v, now));
  const passIssues = mine.filter((p) => hasDiscrepancy(p) && p.check?.at.slice(0, 7) === month).length;
  const deliveryIssues = goodsReceipts.filter((r) => r.orgId === orgId && r.at.slice(0, 7) === month && r.result !== 'Cleared to stores').length;

  const q = search.trim().toLowerCase();
  const match = (p: GatePass) => {
    switch (filter) {
      case 'Awaiting approval':
        return p.status === 'Awaiting approval';
      case 'Ready at gate':
        return p.status === 'Approved';
      case 'Out — to return':
        return awaitsReturn(p);
      case 'Overdue':
        return isOverdue(p, today);
      case 'Discrepancies':
        return hasDiscrepancy(p);
      case 'Closed':
        return ['Returned', 'Rejected', 'Cancelled'].includes(p.status) || (p.status === 'Exited' && !p.expectedReturn);
      default:
        return true;
    }
  };
  const rows = mine
    .filter((p) => match(p) && (!q || `${p.id} ${p.type} ${p.destination} ${p.vehicleReg} ${name(p.raisedBy)} ${itemsSummary(p.items)}`.toLowerCase().includes(q)))
    .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn) || b.id.localeCompare(a.id));
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Passes awaiting approval" value={awaiting} sub="With department heads" tone={awaiting ? 'var(--status-warning)' : undefined} />
        <Stat label="Items out awaiting return" value={out.length} sub={overdue.length ? `${overdue.length} overdue` : 'None overdue'} tone={overdue.length ? 'var(--status-critical)' : undefined} />
        <Stat label="Visitors on site" value={onSite.length} sub={overstays.length ? `${overstays.length} past expected exit` : 'No overstays'} tone={overstays.length ? 'var(--status-warning)' : undefined} />
        <Stat label="Discrepancies this month" value={passIssues + deliveryIssues} sub={`${passIssues} at exit · ${deliveryIssues} on deliveries`} tone={passIssues + deliveryIssues ? 'var(--status-critical)' : undefined} />
      </div>

      {overdue.length > 0 && (
        <div className="pr-note warn" style={{ marginBottom: 12 }}>
          Overdue returns: {overdue.map((p) => `${p.id} (${p.items[0]?.desc}, due ${fmt(p.expectedReturn)}, ${daysBetween(p.expectedReturn!, today)} days late)`).join(' · ')}
        </div>
      )}

      <Card
        title="Gate passes"
        sub="Goods leaving or entering the site. Raised by an employee, approved by the department head, then checked item by item at the gate."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setRaising(true)}>
            <Plus size={14} /> Raise gate pass
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search pass, item, vehicle, person..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {FILTERS.map((k) => (
              <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Pass</th>
                <th>Raised by</th>
                <th>Items</th>
                <th>Destination / vehicle</th>
                <th>Gate check</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No gate passes match.</Empty>}
              {pg.rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="hi-mono">{p.id}</div>
                    <div className="hi-sub">{p.type}</div>
                  </td>
                  <td>
                    {name(p.raisedBy)}
                    <div className="hi-sub">
                      {p.department} · {fmt(p.raisedOn)}
                    </div>
                  </td>
                  <td className="hi-wrap" style={{ maxWidth: 280 }}>
                    {itemsSummary(p.items)}
                    <div className="hi-sub">{p.reason}</div>
                  </td>
                  <td className="hi-wrap">
                    {p.destination}
                    <div className="hi-sub">
                      {p.vehicleReg} · {p.driver}
                    </div>
                  </td>
                  <td>
                    {p.check ? (
                      <>
                        {fmtStamp(p.check.at)}
                        <div className="hi-sub">{p.check.guard}</div>
                        {hasDiscrepancy(p) && (
                          <div title={[p.check.discrepancy, p.check.photoNote].filter(Boolean).join(' · ')}>
                            <Pill tone="danger">
                              <AlertTriangle size={11} /> Discrepancy
                            </Pill>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="hi-sub">Not yet</span>
                    )}
                  </td>
                  <td>
                    <Pill tone={statusTone(p, today)}>{isOverdue(p, today) ? 'Overdue return' : p.status === 'Exited' && awaitsReturn(p) ? 'Out — to return' : p.status}</Pill>
                    <div className="hi-sub">
                      {p.status === 'Awaiting approval' && `With ${name(p.approverId)}`}
                      {p.decision && p.status !== 'Awaiting approval' && `${p.status === 'Rejected' ? 'Rejected' : 'Approved'} by ${name(p.decision.by)}`}
                      {p.expectedReturn && p.status !== 'Returned' && p.status !== 'Rejected' && ` · back by ${fmt(p.expectedReturn)}`}
                      {p.returned && ` · back ${fmtStamp(p.returned.at)}`}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.status === 'Awaiting approval' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setDeciding(p)}>
                        Decide
                      </button>
                    )}
                    {p.status === 'Approved' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setChecking(p)}>
                        <LogOut size={13} /> Gate check
                      </button>
                    )}
                    {awaitsReturn(p) && (
                      <button className="btn btn-primary btn-sm" onClick={() => setReturning(p)}>
                        <Undo2 size={13} /> Returned
                      </button>
                    )}{' '}
                    <button className="btn btn-secondary btn-sm" title="Print gate pass" aria-label="Print gate pass" onClick={() => setPrinting(p)}>
                      <Printer size={13} />
                    </button>
                    {(p.status === 'Awaiting approval' || p.status === 'Approved') && (
                      <>
                        {' '}
                        <button className="btn btn-secondary btn-sm" title="Cancel pass" aria-label="Cancel pass" onClick={() => cancelGatePass(p.id)}>
                          <X size={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="passes" sizes={[10, 25, 50]} />
      </Card>

      <GoodsInCard />
      <VisitorsCard />

      {raising && <RaisePassModal onClose={() => setRaising(false)} />}
      {deciding && <DecideModal pass={deciding} onClose={() => setDeciding(null)} />}
      {checking && <GateCheckModal pass={checking} onClose={() => setChecking(null)} />}
      {returning && <ReturnModal pass={returning} onClose={() => setReturning(null)} />}
      {printing && <PrintPassModal pass={printing} onClose={() => setPrinting(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ modals */

const RETURNABLE: PassType[] = ['Returnable', 'Contractor equipment'];

const RaisePassModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { raiseGatePass } = useApp();
  const { staff, today, byId } = useSecOrg();
  const approvers = useApprovers();
  const [type, setType] = useState<PassType>('Returnable');
  const [raisedBy, setRaisedBy] = useState('');
  const [approverId, setApproverId] = useState('');
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [driver, setDriver] = useState('');
  const [expectedReturn, setExpectedReturn] = useState(plusDays(today, 7));
  const [items, setItems] = useState<PassItem[]>([{ desc: '', qty: 1, unit: 'pcs', serial: '' }]);
  const setItem = (i: number, patch: Partial<PassItem>) => setItems((list) => list.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const needsReturn = type === 'Returnable';
  const clean = items.filter((i) => i.desc.trim() && i.qty > 0);
  const ok = raisedBy && approverId && reason.trim() && destination.trim() && clean.length > 0 && (!needsReturn || expectedReturn >= today);

  return (
    <Modal
      title="Raise gate pass"
      subtitle="The department head approves it before the gate will let the items through."
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              raiseGatePass({
                type,
                raisedBy,
                department: byId.get(raisedBy)?.department ?? '',
                approverId,
                reason: reason.trim(),
                destination: destination.trim(),
                items: clean.map((i) => ({ ...i, desc: i.desc.trim(), serial: i.serial?.trim() || undefined })),
                vehicleReg: vehicleReg.trim() || '—',
                driver: driver.trim() || '—',
                expectedReturn: RETURNABLE.includes(type) && expectedReturn ? expectedReturn : undefined
              });
              onClose();
            }}
          >
            Send for approval
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Pass type">
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as PassType)}>
            {PASS_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Raised by">
          <PersonSelect value={raisedBy} onChange={setRaisedBy} people={staff} />
        </Field>
        <Field label="Department head (approver)">
          <PersonSelect value={approverId} onChange={setApproverId} people={approvers} />
        </Field>
        <Field label="Destination / from">
          <input className="form-control" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Where the goods go (or come from)" />
        </Field>
        <Field label="Vehicle registration">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="e.g. KDA 220M" />
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </Field>
        {RETURNABLE.includes(type) && (
          <Field label="Expected back" hint={type === 'Contractor equipment' ? 'Leave as is if the equipment is leaving for good' : 'Overdue returns are flagged at the gate'}>
            <input className="form-control" type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} />
          </Field>
        )}
        <Field label="Reason" wide>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the goods are moving; quote the tender, invoice or job card" />
        </Field>
      </div>
      <table className="hr-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ width: 90 }}>Qty</th>
            <th style={{ width: 90 }}>Unit</th>
            <th>Serial / tag</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>
                <input className="form-control" value={it.desc} onChange={(e) => setItem(i, { desc: e.target.value })} placeholder="Description" />
              </td>
              <td>
                <input className="form-control" type="number" min={0} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} />
              </td>
              <td>
                <input className="form-control" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
              </td>
              <td>
                <input className="form-control" value={it.serial ?? ''} onChange={(e) => setItem(i, { serial: e.target.value })} />
              </td>
              <td>
                {items.length > 1 && (
                  <button className="btn btn-secondary btn-sm" aria-label="Remove item" onClick={() => setItems((list) => list.filter((_, k) => k !== i))}>
                    <X size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button className="btn btn-secondary btn-sm" onClick={() => setItems((list) => [...list, { desc: '', qty: 1, unit: 'pcs', serial: '' }])}>
          <Plus size={13} /> Add item
        </button>
      </div>
    </Modal>
  );
};

const DecideModal: React.FC<{ pass: GatePass; onClose: () => void }> = ({ pass: p, onClose }) => {
  const { decideGatePass } = useApp();
  const { name } = useSecOrg();
  const [note, setNote] = useState('');
  const act = (approve: boolean) => {
    decideGatePass(p.id, approve, note.trim());
    onClose();
  };
  return (
    <Modal
      title={`Approve gate pass ${p.id}`}
      subtitle={`${p.type} · raised by ${name(p.raisedBy)} · approver ${name(p.approverId)}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" disabled={!note.trim()} title={note.trim() ? undefined : 'Give a reason to reject'} onClick={() => act(false)}>
            Reject
          </button>
          <button className="btn btn-primary" onClick={() => act(true)}>
            <CheckCircle2 size={14} /> Approve
          </button>
        </>
      }
    >
      <div className="pr-note">
        <strong>{itemsSummary(p.items)}</strong>
        <br />
        To {p.destination}. {p.reason}
        {p.expectedReturn && ` Expected back ${fmt(p.expectedReturn)}.`}
      </div>
      <Field label="Note" hint="Required when rejecting" wide>
        <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
};

const GateCheckModal: React.FC<{ pass: GatePass; onClose: () => void }> = ({ pass: p, onClose }) => {
  const { gateCheckOut } = useApp();
  const { guards } = useSecOrg();
  const [guard, setGuard] = useState(guards[0] ?? '');
  const [counted, setCounted] = useState(p.items.map((i) => String(i.qty)));
  const [sealNos, setSealNos] = useState('');
  const [vehicleReg, setVehicleReg] = useState(p.vehicleReg === '—' ? '' : p.vehicleReg);
  const [driver, setDriver] = useState(p.driver === '—' ? '' : p.driver);
  const [discrepancy, setDiscrepancy] = useState('');
  const [photoNote, setPhotoNote] = useState('');
  const nums = counted.map((c) => Number(c) || 0);
  const mismatch = nums.some((c, i) => c !== p.items[i].qty);
  const ok = guard.trim() && (!mismatch || discrepancy.trim());
  return (
    <Modal
      title={`Gate check — ${p.id}`}
      subtitle={`${p.type} to ${p.destination}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              gateCheckOut(p.id, { guard: guard.trim(), counted: nums, sealNos: sealNos.trim() || '—', vehicleReg: vehicleReg.trim() || '—', driver: driver.trim() || '—', discrepancy: discrepancy.trim() || undefined, photoNote: photoNote.trim() || undefined });
              onClose();
            }}
          >
            <LogOut size={14} /> Record exit
          </button>
        </>
      }
    >
      <table className="hr-table">
        <thead>
          <tr>
            <th>Item on pass</th>
            <th>On pass</th>
            <th style={{ width: 130 }}>Counted at gate</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((it, i) => (
            <tr key={i}>
              <td>
                {it.desc}
                {it.serial && <div className="hi-sub">{it.serial}</div>}
              </td>
              <td>
                {it.qty.toLocaleString()} {it.unit}
              </td>
              <td>
                <input
                  className="form-control"
                  type="number"
                  min={0}
                  value={counted[i]}
                  onChange={(e) => setCounted((list) => list.map((x, k) => (k === i ? e.target.value : x)))}
                  style={nums[i] !== it.qty ? { borderColor: 'var(--status-critical)' } : undefined}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mismatch && <div className="pr-note warn">Counted quantities differ from the pass. Describe the discrepancy; the pass will be flagged.</div>}
      <div className="pr-form-grid">
        <Field label="Guard">
          <GuardInput id="gc-guard" value={guard} onChange={setGuard} guards={guards} />
        </Field>
        <Field label="Seal numbers" hint="Truck, container or tarp seals, comma separated">
          <input className="form-control" value={sealNos} onChange={(e) => setSealNos(e.target.value)} />
        </Field>
        <Field label="Vehicle registration">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </Field>
        <Field label="Discrepancy" wide>
          <input className="form-control" value={discrepancy} onChange={(e) => setDiscrepancy(e.target.value)} placeholder="Leave blank if everything matches" />
        </Field>
        <Field label="Photo note" hint="Where the photos are saved (gate tablet folder, file name)" wide>
          <input className="form-control" value={photoNote} onChange={(e) => setPhotoNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const ReturnModal: React.FC<{ pass: GatePass; onClose: () => void }> = ({ pass: p, onClose }) => {
  const { recordGateReturn } = useApp();
  const { guards } = useSecOrg();
  const [guard, setGuard] = useState(guards[0] ?? '');
  const [complete, setComplete] = useState(true);
  const [note, setNote] = useState('');
  return (
    <Modal
      title={`Record return — ${p.id}`}
      subtitle={`${itemsSummary(p.items)} · due back ${fmt(p.expectedReturn)}`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!guard.trim() || (!complete && !note.trim())}
            onClick={() => {
              recordGateReturn(p.id, { guard: guard.trim(), note: note.trim(), complete });
              onClose();
            }}
          >
            Record return
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Guard">
          <GuardInput id="ret-guard" value={guard} onChange={setGuard} guards={guards} />
        </Field>
        <Field label="Everything back?">
          <select className="form-control" value={complete ? 'yes' : 'no'} onChange={(e) => setComplete(e.target.value === 'yes')}>
            <option value="yes">Yes, all items checked back in</option>
            <option value="no">No, part return</option>
          </select>
        </Field>
        <Field label="Note" hint={complete ? 'Condition on return' : 'Say what is still out'} wide>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const PrintPassModal: React.FC<{ pass: GatePass; onClose: () => void }> = ({ pass: p, onClose }) => {
  const { name, company } = useSecOrg();
  const report: Report = {
    title: `Gate pass ${p.id}`,
    subtitle: `${p.type} · raised ${fmt(p.raisedOn)}`,
    sections: [
      {
        heading: 'Details',
        columns: [{ label: 'Field' }, { label: 'Value' }],
        rows: [
          ['Raised by', `${name(p.raisedBy)} (${p.department})`],
          ['Reason', p.reason],
          ['Destination / from', p.destination],
          ['Vehicle', p.check?.vehicleReg ?? p.vehicleReg],
          ['Driver', p.check?.driver ?? p.driver],
          ['Approved by', p.decision ? `${name(p.decision.by)} on ${fmt(p.decision.on)} — ${p.decision.note}` : `Awaiting ${name(p.approverId)}`],
          ['Expected back', p.expectedReturn ? fmt(p.expectedReturn) : 'Not returnable'],
          ['Status', p.status]
        ]
      },
      {
        heading: 'Items',
        columns: [{ label: 'Item' }, { label: 'Serial / tag' }, { label: 'Qty on pass' }, { label: 'Unit' }, { label: 'Counted at gate' }],
        rows: p.items.map((it, i) => [it.desc, it.serial ?? '', it.qty, it.unit, p.check ? p.check.counted[i] ?? '' : ''])
      },
      ...(p.check
        ? [
            {
              heading: 'Gate check',
              columns: [{ label: 'Field' }, { label: 'Value' }],
              rows: [
                ['Checked by', p.check.guard],
                ['Exit time', fmtStamp(p.check.at)],
                ['Seal numbers', p.check.sealNos],
                ['Discrepancy', p.check.discrepancy ?? 'None'],
                ['Photo note', p.check.photoNote ?? '—'],
                ...(p.returned ? [['Returned', `${fmtStamp(p.returned.at)} · ${p.returned.guard} · ${p.returned.complete ? 'complete' : 'part'} ${p.returned.note}`]] : [])
              ] as (string | number)[][]
            }
          ]
        : [])
    ],
    footnote: 'The gate will not release goods without an approved pass. Quantities, serials and seals are checked against this pass at exit.',
    signatures: ['Requested by', 'Approved by (department head)', 'Checked out by (guard)', 'Received back by']
  };
  return (
    <Modal title={`Print gate pass ${p.id}`} onClose={onClose} width={900}>
      <ReportPaper report={report} company={company} preparedBy={name(p.raisedBy)} />
    </Modal>
  );
};
