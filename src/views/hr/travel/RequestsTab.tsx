import React, { useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plane, Plus, Printer, Search, Send, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { destLabel, FINANCE_APPROVER, TRANSPORT, type TravelRequest, type TravelStatus } from '../../../data/travelEngine';
import { RequestForm } from './RequestForm';
import { TravelAuthority } from './TravelAuthority';
import { ApprovalChain, Card, EmpCell, Empty, Field, fmt, ImprestPill, kes, Modal, Timeline, TravelPill, useTravelOrg } from './shared';

const FILTERS: { id: string; label: string; match: (s: TravelStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'approval', label: 'Awaiting approval', match: (s) => s === 'SUBMITTED' || s === 'MANAGER_APPROVED' },
  { id: 'active', label: 'Approved & travelling', match: (s) => ['FINANCE_APPROVED', 'ADVANCE_PAID', 'TRAVELLED'].includes(s) },
  { id: 'done', label: 'Surrendered & closed', match: (s) => s === 'SURRENDERED' || s === 'CLOSED' },
  { id: 'other', label: 'Drafts & declined', match: (s) => s === 'DRAFT' || s === 'DECLINED' }
];

/** Request detail: costs, approval chain, decisions and timeline. */
const RequestDetail: React.FC<{ r: TravelRequest; onClose: () => void; onEdit: () => void; onPrint: () => void }> = ({ r, onClose, onEdit, onPrint }) => {
  const { decideTravelRequest, submitTravelRequest, markTravelled, closeTravelRequest, imprests, payImprest, travelToday, payrollOpenPeriod } = useApp();
  const { byId, name } = useTravelOrg();
  const [comment, setComment] = useState('');
  const [via, setVia] = useState<'CASH' | 'PAYROLL'>('CASH');
  const [advance, setAdvance] = useState(r.advanceRequested);
  const [error, setError] = useState('');
  const e = byId.get(r.staffId);
  const imp = imprests.find((i) => i.id === r.imprestId);
  const est = r.estimate;
  const financeStep = r.status === 'MANAGER_APPROVED';
  const cap = via === 'PAYROLL' ? est.total - est.perDiem : est.total;
  const run = (res: { ok: boolean; reason?: string }) => (res.ok ? onClose() : setError(res.reason ?? 'Could not complete.'));

  return (
    <Modal title={`${r.id} — ${r.destinations}`} subtitle={`${name(r.staffId)} · ${e?.jobTitle ?? ''} · ${fmt(r.departDate)} to ${fmt(r.returnDate)}`} onClose={onClose} width={900}>
      <div className="pr-kv">
        <div>
          <span>Status</span>
          <strong>
            <TravelPill r={r} />
          </strong>
        </div>
        <div>
          <span>Destination</span>
          <strong>{r.destinations}</strong>
          <small>{destLabel(r.destClass)}</small>
        </div>
        <div>
          <span>Transport</span>
          <strong>{TRANSPORT[r.transport]}</strong>
          {r.transport === 'OWN_CAR' && <small>{r.km} km</small>}
        </div>
        <div>
          <span>Estimate</span>
          <strong>{kes(est.total)}</strong>
          <small>
            {est.nights} night(s) · band {est.band}
          </small>
        </div>
        <div>
          <span>Advance</span>
          <strong>{kes(r.advanceApproved ?? r.advanceRequested)}</strong>
          <small>{r.advanceApproved !== undefined ? 'approved' : 'requested'}</small>
        </div>
      </div>
      <p style={{ margin: 0 }}>
        <strong>Purpose:</strong> {r.purpose}
      </p>

      <div className="hi-two">
        <div>
          <h4 className="trv-h4">Cost estimate</h4>
          <table className="hr-table">
            <tbody>
              <tr>
                <td>Accommodation</td>
                <td className="hi-num">{kes(est.accommodation)}</td>
              </tr>
              <tr>
                <td>Meals and incidentals</td>
                <td className="hi-num">{kes(est.meals + est.incidentals)}</td>
              </tr>
              <tr>
                <td>Mileage and fares</td>
                <td className="hi-num">{kes(est.mileage + est.fares)}</td>
              </tr>
              <tr className="trv-total">
                <td>Total</td>
                <td className="hi-num">{kes(est.total)}</td>
              </tr>
            </tbody>
          </table>
          {r.perDiemVia && (
            <p className="hi-sub" style={{ marginTop: 6 }}>
              Per diem {r.perDiemVia === 'PAYROLL' ? `through payroll${r.perDiemPayRef ? ` (${r.perDiemPayRef})` : ''}` : 'in cash with the advance'}
            </p>
          )}
          {imp && (
            <p className="hi-sub">
              Advance {imp.id}: <ImprestPill i={imp} today={travelToday} /> {imp.dueOn && imp.status === 'PAID' ? `surrender by ${fmt(imp.dueOn)}` : ''}
            </p>
          )}
        </div>
        <div>
          <h4 className="trv-h4">Approvals</h4>
          <ApprovalChain r={r} />
        </div>
      </div>

      {(r.status === 'SUBMITTED' || financeStep) && (
        <div className="trv-decide">
          <h4 className="trv-h4">{financeStep ? `Finance decision — ${name(FINANCE_APPROVER)}` : `Line manager decision — ${name(r.managerId)}`}</h4>
          {financeStep && (
            <div className="pr-form-grid">
              <Field label="Pay per diem">
                <select className="form-control" value={via} onChange={(ev) => setVia(ev.target.value as 'CASH' | 'PAYROLL')}>
                  <option value="CASH">In cash, inside the advance</option>
                  <option value="PAYROLL">Through payroll — {payrollOpenPeriod.label} (tax-exempt)</option>
                </select>
              </Field>
              <Field label="Advance to approve (KES)" hint={`Up to ${kes(cap)}${via === 'PAYROLL' ? ` — per diem of ${kes(est.perDiem)} goes through payroll` : ''}`}>
                <input className="form-control" type="number" min={0} max={cap} value={Math.min(advance, cap)} onChange={(ev) => setAdvance(Number(ev.target.value) || 0)} />
              </Field>
            </div>
          )}
          <Field label="Comment" wide>
            <input className="form-control" value={comment} placeholder="Required when declining" onChange={(ev) => setComment(ev.target.value)} />
          </Field>
          <div className="hi-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => run(decideTravelRequest(r.id, false, comment))}>
              <XCircle size={14} /> Decline
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => run(decideTravelRequest(r.id, true, comment, financeStep ? { perDiemVia: via, advanceApproved: Math.min(advance, cap) } : {}))}>
              <CheckCircle2 size={14} /> Approve
            </button>
          </div>
        </div>
      )}

      {error && <div className="pr-note bad">{error}</div>}

      <div className="hi-actions">
        {r.status === 'DRAFT' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={onEdit}>
              <Pencil size={14} /> Edit
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => run(submitTravelRequest(r.id))}>
              <Send size={14} /> Submit
            </button>
          </>
        )}
        {imp && imp.status === 'APPROVED' && (
          <button className="btn btn-primary btn-sm" onClick={() => run(payImprest(imp.id))}>
            Pay advance {kes(imp.amount)}
          </button>
        )}
        {(r.status === 'ADVANCE_PAID' || (r.status === 'FINANCE_APPROVED' && !imp)) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              markTravelled(r.id);
              onClose();
            }}
          >
            <Plane size={14} /> Mark back from trip
          </button>
        )}
        {(r.status === 'SURRENDERED' || (r.status === 'TRAVELLED' && !imp)) && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              closeTravelRequest(r.id);
              onClose();
            }}
          >
            Close trip
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={onPrint}>
          <Printer size={14} /> Travel authority
        </button>
      </div>

      <h4 className="trv-h4">Timeline</h4>
      <Timeline events={r.events} />
    </Modal>
  );
};

export const RequestsTab: React.FC = () => {
  const { travelRequests, selectedOrgId } = useApp();
  const { name } = useTravelOrg();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState('');
  const [form, setForm] = useState<{ existing?: TravelRequest } | null>(null);
  const [printId, setPrintId] = useState('');

  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      travelRequests
        .filter((r) => FILTERS.find((x) => x.id === filter)!.match(r.status))
        .filter((r) => !q || `${r.id} ${name(r.staffId)} ${r.staffId} ${r.destinations} ${r.purpose}`.toLowerCase().includes(q))
        .sort((a, b) => b.departDate.localeCompare(a.departDate)),
    [travelRequests, filter, q, name]
  );
  const pg = usePaged(rows, 10, `${filter}|${q}|${selectedOrgId}`);
  const open = travelRequests.find((r) => r.id === openId);
  const printing = travelRequests.find((r) => r.id === printId);

  return (
    <>
      <Card
        title="Travel requests"
        sub="Line manager approves, then Finance (David Otieno) sets the advance and how per diem is paid."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setForm({})}>
            <Plus size={14} /> New request
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by traveller, destination, purpose or reference..." value={search} onChange={(ev) => setSearch(ev.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {FILTERS.map((f) => (
              <button key={f.id} className={`digicraft-filter-pill ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label} ({travelRequests.filter((r) => f.match(r.status)).length})
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Traveller</th>
                <th>Trip</th>
                <th>Dates</th>
                <th className="hi-num">Estimate</th>
                <th className="hi-num">Advance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No travel requests match.</Empty>}
              {pg.rows.map((r) => (
                <tr key={r.id} className="hi-click" onClick={() => setOpenId(r.id)}>
                  <td className="hi-mono">{r.id}</td>
                  <td>
                    <EmpCell staffId={r.staffId} sub={r.estimate.band} />
                  </td>
                  <td className="hi-wrap">
                    <strong>{r.destinations}</strong>
                    <div className="hi-sub">
                      {r.purpose} · {TRANSPORT[r.transport]}
                    </div>
                  </td>
                  <td>
                    {fmt(r.departDate)}
                    <div className="hi-sub">
                      to {fmt(r.returnDate)} · {r.estimate.nights}n
                    </div>
                  </td>
                  <td className="hi-num">{kes(r.estimate.total)}</td>
                  <td className="hi-num">{kes(r.advanceApproved ?? r.advanceRequested)}</td>
                  <td>
                    <TravelPill r={r} />
                    {r.status === 'SUBMITTED' && <div className="hi-sub">with {name(r.managerId)}</div>}
                    {r.status === 'MANAGER_APPROVED' && <div className="hi-sub">with Finance</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="requests" sizes={[10, 25, 50]} />
      </Card>

      {open && !form && !printing && (
        <RequestDetail key={open.id + open.status} r={open} onClose={() => setOpenId('')} onEdit={() => setForm({ existing: open })} onPrint={() => setPrintId(open.id)} />
      )}
      {form && (
        <RequestForm
          existing={form.existing}
          onClose={() => {
            setForm(null);
            setOpenId('');
          }}
        />
      )}
      {printing && <TravelAuthority r={printing} onClose={() => setPrintId('')} />}
    </>
  );
};
