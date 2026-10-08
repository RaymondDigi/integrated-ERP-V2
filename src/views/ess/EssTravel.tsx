/* Portal panels for Travel, petty cash and imprest: trip requests, advances and surrenders. */
import React, { useMemo, useState } from 'react';
import { AlertCircle, Banknote, Plane, Plus, Receipt, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supervisorFor } from '../../data/leaveConfig';
import { addDays } from '../../data/timeEngine';
import {
  bandOf,
  DEST_CLASSES,
  estimateTrip,
  FINANCE_APPROVER,
  IMPREST_KIND,
  IMPREST_STATUS,
  overdueDays,
  PETTY_CASH_LIMIT,
  receiptsTotal,
  TRANSPORT,
  TRAVEL_STATUS,
  TRAVEL_SURRENDER_DAYS,
  type DestClass,
  type Imprest,
  type ReceiptLine,
  type Settlement,
  type TransportMode,
  type TravelRequest,
  lineAmount
} from '../../data/travelEngine';
import type { ImprestLineDraft, TravelDraft } from '../../context/travelState';
import { blankImprestLine, draftTotal, ImprestLinesEditor } from '../hr/travel/ImprestLines';
import { ESS_EMPLOYEE, formatDate, formatKes } from './essData';
import { rememberAdvance, rememberedAdvances, rememberedTrips, rememberTrip } from './essSession';
import { Capped, OtherCompanyNote, Pill, pillTone, ReqError, Steps, useEssMe } from './essShared';

const ME = ESS_EMPLOYEE.staffId;
const ACTOR = ESS_EMPLOYEE.fullName;

/** Session snapshots fill in for records hidden by the company filter; the live record always wins. */
const mergeById = <T extends { id: string }>(live: T[], remembered: T[]) => [...live, ...remembered.filter((r) => !live.some((l) => l.id === r.id))];

/* ------------------------------------------------------------------ */
/* Surrender (receipt lines)                                           */
/* ------------------------------------------------------------------ */

const blankLine = (date: string): ReceiptLine => ({ date, description: '', amount: 0, receiptNo: '' });

const SurrenderForm: React.FC<{ imprest: Imprest; onClose: () => void }> = ({ imprest, onClose }) => {
  const { surrenderImprest, travelToday: today } = useApp();
  // A multi-line request starts with one receipt row per item, at the approved amount
  const [lines, setLines] = useState<ReceiptLine[]>(() => (imprest.lines?.length ? imprest.lines.filter((l) => (l.approved ?? l.amount) > 0).map((l) => ({ ...blankLine(today), description: l.description, amount: l.approved ?? l.amount })) : [blankLine(today)]));
  const [preference, setPreference] = useState<Settlement>('CASH_REFUND');
  const [waive, setWaive] = useState(false);
  const [error, setError] = useState('');
  const spent = receiptsTotal(lines);
  const variance = imprest.amount - spent;
  const overspent = variance < 0;

  const patch = (i: number, p: Partial<ReceiptLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // The employee states a preference; an overspend can only be reimbursed once Finance approves it
    const settlement: Settlement = variance === 0 ? 'NONE' : overspent ? 'NOT_REIMBURSED' : preference;
    const r = surrenderImprest(imprest.id, { lines, settlement }, ACTOR);
    if (!r.ok) return setError(r.reason ?? 'Surrender not saved.');
    onClose();
  };

  return (
    <form className="ess-form ess-surrender" onSubmit={submit} noValidate>
      <div className="ess-surrender-head">
        <strong>
          Surrender {imprest.id} · {formatKes(imprest.amount)}
        </strong>
        <span className="ess-muted">{imprest.dueOn ? `Due ${formatDate(imprest.dueOn)}` : ''}</span>
      </div>
      <div className="ess-receipts">
        {lines.map((l, i) => (
          <div key={i} className="ess-receipt-row">
            <label className="req-field">
              <span>Date</span>
              <input type="date" className="form-control" max={today} value={l.date} onChange={(e) => patch(i, { date: e.target.value })} />
            </label>
            <label className="req-field ess-receipt-desc">
              <span>What for</span>
              <input className="form-control" value={l.description} onChange={(e) => patch(i, { description: e.target.value })} placeholder="e.g. Hotel, 2 nights" />
            </label>
            <label className="req-field">
              <span>Receipt no.</span>
              <input className="form-control" value={l.receiptNo} onChange={(e) => patch(i, { receiptNo: e.target.value })} />
            </label>
            <label className="req-field">
              <span>Amount (KES)</span>
              <input type="number" min={0} className="form-control" value={l.amount || ''} onChange={(e) => patch(i, { amount: Number(e.target.value) || 0 })} />
            </label>
            <button type="button" className="btn btn-secondary btn-sm ess-receipt-del" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="ess-link" onClick={() => setLines((ls) => [...ls, blankLine(today)])}>
          <Plus size={13} /> Add receipt
        </button>
      </div>
      <div className="ess-sums">
        <span>
          Spent <strong>{formatKes(spent)}</strong>
        </span>
        <span>
          Advance <strong>{formatKes(imprest.amount)}</strong>
        </span>
        <span className={overspent ? 'ess-late' : ''}>
          {variance >= 0 ? 'Unspent' : 'Overspent'} <strong>{formatKes(Math.abs(variance))}</strong>
        </span>
      </div>
      {variance > 0 && (
        <div className="req-field">
          <span>How would you like to return the unspent {formatKes(variance)}?</span>
          <label className="ess-check">
            <input type="radio" name={`pref-${imprest.id}`} checked={preference === 'CASH_REFUND'} onChange={() => setPreference('CASH_REFUND')} /> I’ll hand the cash back to Finance
          </label>
          <label className="ess-check">
            <input type="radio" name={`pref-${imprest.id}`} checked={preference === 'PAYROLL_RECOVERY'} onChange={() => setPreference('PAYROLL_RECOVERY')} /> Deduct it from my next salary
          </label>
          <span className="ess-hint">Your preference — Finance confirms when they check the receipts.</span>
        </div>
      )}
      {overspent && (
        <div className="ess-notice warn">
          <AlertCircle size={14} /> You spent {formatKes(-variance)} more than the advance. Only Finance can approve paying back an overspend — take your receipts to Finance and they will record the surrender. If you don’t want to claim the extra, tick below and submit.
          <label className="ess-check">
            <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> I won’t claim the extra {formatKes(-variance)}
          </label>
        </div>
      )}
      <ReqError text={error} />
      <div className="ess-form-actions">
        <span className="ess-hint">Hand the original receipts to Finance.</span>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={overspent && !waive}>
          Submit surrender
        </button>
      </div>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/* Travel                                                              */
/* ------------------------------------------------------------------ */

const TRIP_STEPS = ['Submitted', 'Line manager', 'Finance', 'Advance paid', 'Surrendered'];
const tripStep = (s: TravelRequest['status']) =>
  ({ DRAFT: -1, SUBMITTED: 0, MANAGER_APPROVED: 1, FINANCE_APPROVED: 2, ADVANCE_PAID: 3, TRAVELLED: 3, SURRENDERED: 4, CLOSED: 4, DECLINED: 0 })[s];

const emptyTrip = (today: string): TravelDraft => ({
  staffId: ME,
  purpose: '',
  destinations: '',
  destClass: 'TOWN',
  departDate: addDays(today, 7),
  returnDate: addDays(today, 9),
  transport: 'COMPANY_CAR',
  km: undefined,
  fares: undefined,
  advanceRequested: 0
});

export const EssTravel: React.FC = () => {
  const { perDiemSchedules, allTravelRequests: travelRequests, saveTravelRequest, submitTravelRequest, markTravelled, allImprests: imprests, imprestBlock, travelToday: today } = useApp();
  const me = useEssMe();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [draft, setDraft] = useState<TravelDraft>(() => emptyTrip(today));
  const [error, setError] = useState('');
  const [surrenderId, setSurrenderId] = useState<string | null>(null);
  const set = (p: Partial<TravelDraft>) => setDraft((d) => ({ ...d, ...p }));
  const nameOf = (id?: string) => (id ? (me.hrEmployees.find((e) => e.staffId === id)?.fullName ?? id) : '—');

  const estimate = me.record ? estimateTrip(draft, bandOf(me.record), perDiemSchedules) : undefined;
  const block = imprestBlock(ME);
  const trips = useMemo(
    () => mergeById(travelRequests.filter((t) => t.staffId === ME), rememberedTrips()).sort((a, b) => b.createdOn.localeCompare(a.createdOn) || b.id.localeCompare(a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [travelRequests, open]
  );

  const close = () => {
    setOpen(false);
    setEditId(undefined);
    setDraft(emptyTrip(today));
    setError('');
  };

  const save = (submit: boolean) => {
    if (!me.record || !estimate) return;
    const r = saveTravelRequest(draft, submit, editId, ACTOR);
    if (!r.ok || !r.id) return setError(r.reason ?? 'Request not saved.');
    const mgr = supervisorFor(me.record, me.hrEmployees);
    rememberTrip({ ...draft, id: r.id, orgId: me.orgId, estimate, managerId: mgr?.staffId, status: submit ? 'SUBMITTED' : 'DRAFT', createdOn: today, events: [] });
    close();
  };

  const edit = (t: TravelRequest) => {
    setDraft({ staffId: ME, purpose: t.purpose, destinations: t.destinations, destClass: t.destClass, departDate: t.departDate, returnDate: t.returnDate, transport: t.transport, km: t.km, fares: t.fares, advanceRequested: t.advanceRequested });
    setEditId(t.id);
    setOpen(true);
  };

  const submitDraft = (t: TravelRequest) => {
    const r = submitTravelRequest(t.id, ACTOR);
    if (!r.ok) setError(r.reason ?? '');
    else rememberTrip({ ...t, status: 'SUBMITTED' });
  };

  return (
    <div className="ess-stack">
      <OtherCompanyNote />
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <Plane size={16} /> {open ? (editId ? `Edit ${editId}` : 'Travel request') : 'My trips'}
          </h3>
          {!open && (
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              <Plus size={14} /> Request travel
            </button>
          )}
        </div>

        {open && (
          <form className="ess-form" onSubmit={(e) => {
              e.preventDefault();
              save(true);
            }} noValidate>
            <div className="ess-form-grid">
              <label className="req-field ess-span-2">
                <span>Destination(s) *</span>
                <input className="form-control" value={draft.destinations} onChange={(e) => set({ destinations: e.target.value })} placeholder="e.g. Kericho, Nandi Hills" />
              </label>
              <label className="req-field ess-span-2">
                <span>Destination class *</span>
                <select className="form-control" value={draft.destClass} onChange={(e) => set({ destClass: e.target.value as DestClass })}>
                  {DEST_CLASSES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>Depart *</span>
                <input type="date" className="form-control" value={draft.departDate} onChange={(e) => set({ departDate: e.target.value })} />
              </label>
              <label className="req-field">
                <span>Return *</span>
                <input type="date" className="form-control" min={draft.departDate} value={draft.returnDate} onChange={(e) => set({ returnDate: e.target.value })} />
              </label>
              <label className="req-field">
                <span>Transport *</span>
                <select className="form-control" value={draft.transport} onChange={(e) => set({ transport: e.target.value as TransportMode })}>
                  {(Object.keys(TRANSPORT) as TransportMode[]).map((t) => (
                    <option key={t} value={t}>
                      {TRANSPORT[t]}
                    </option>
                  ))}
                </select>
              </label>
              {draft.transport === 'OWN_CAR' && (
                <label className="req-field">
                  <span>Round trip (km)</span>
                  <input type="number" min={0} className="form-control" value={draft.km ?? ''} onChange={(e) => set({ km: Number(e.target.value) || undefined })} />
                </label>
              )}
              {(draft.transport === 'BUS' || draft.transport === 'AIR') && (
                <label className="req-field">
                  <span>Tickets (KES)</span>
                  <input type="number" min={0} className="form-control" value={draft.fares ?? ''} onChange={(e) => set({ fares: Number(e.target.value) || undefined })} />
                </label>
              )}
              <label className="req-field ess-span-full">
                <span>Purpose *</span>
                <textarea className="form-control" rows={2} value={draft.purpose} onChange={(e) => set({ purpose: e.target.value })} placeholder="Why the trip is needed" />
              </label>
            </div>

            {estimate && (
              <div className="ess-estimate">
                <div className="ess-estimate-rows">
                  <span>
                    Accommodation ({estimate.nights} night{estimate.nights === 1 ? '' : 's'}) <b>{formatKes(estimate.accommodation)}</b>
                  </span>
                  <span>
                    Meals ({estimate.days} day{estimate.days === 1 ? '' : 's'}) <b>{formatKes(estimate.meals)}</b>
                  </span>
                  <span>
                    Incidentals <b>{formatKes(estimate.incidentals)}</b>
                  </span>
                  {estimate.mileage > 0 && (
                    <span>
                      Mileage <b>{formatKes(estimate.mileage)}</b>
                    </span>
                  )}
                  {estimate.fares > 0 && (
                    <span>
                      Fares <b>{formatKes(estimate.fares)}</b>
                    </span>
                  )}
                </div>
                <div className="ess-estimate-total">
                  <span className="ess-stat-label">Estimated cost · {estimate.band}</span>
                  <strong>{formatKes(estimate.total)}</strong>
                  <span className="ess-muted">Per diem {formatKes(estimate.perDiem)}</span>
                </div>
              </div>
            )}

            <div className="ess-form-grid">
              <label className="req-field">
                <span>Advance requested (KES)</span>
                <input type="number" min={0} step={100} className="form-control" value={draft.advanceRequested || ''} onChange={(e) => set({ advanceRequested: Number(e.target.value) || 0 })} />
              </label>
              <div className="req-field ess-span-3 ess-adv-hint">
                {estimate && (
                  <button type="button" className="ess-link" onClick={() => set({ advanceRequested: estimate.total })}>
                    Use the estimate
                  </button>
                )}
                <span className="ess-hint">Surrender receipts within {TRAVEL_SURRENDER_DAYS} days of returning.</span>
              </div>
            </div>
            {block && draft.advanceRequested > 0 && (
              <div className="ess-notice warn">
                <AlertCircle size={14} /> You can’t take a new advance yet: {block}
              </div>
            )}
            <ReqError text={error} />
            <div className="ess-form-actions">
              <span className="ess-hint">
                Line manager ({nameOf(me.record ? supervisorFor(me.record, me.hrEmployees)?.staffId : undefined)}) then Finance ({nameOf(FINANCE_APPROVER)})
              </span>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => save(false)}>
                Save draft
              </button>
              <button type="submit" className="btn btn-primary" disabled={!!block && draft.advanceRequested > 0}>
                Submit
              </button>
            </div>
          </form>
        )}

        {!open && error && <ReqError text={error} />}
        {!open &&
          (trips.length === 0 ? (
            <div className="ess-empty">
              <Plane size={28} />
              <strong>No trips</strong>
              <span>Work trips you request, with their approvals and advances, appear here.</span>
            </div>
          ) : (
            <Capped
              items={trips}
              noun="trips"
              render={(t) => {
                const st = TRAVEL_STATUS[t.status];
                const adv = t.imprestId ? imprests.find((i) => i.id === t.imprestId) : undefined;
                const due = adv?.dueOn ?? (t.advanceRequested > 0 ? addDays(t.returnDate, TRAVEL_SURRENDER_DAYS) : undefined);
                const declined = t.status === 'DECLINED' ? [...t.events].reverse().find((e) => e.comment) : undefined;
                return (
                  <li key={t.id} className="ess-request">
                    <div className="ess-request-top">
                      <div>
                        <strong>
                          {t.destinations} · {formatDate(t.departDate)} – {formatDate(t.returnDate)}
                        </strong>
                        <span className="ess-muted">
                          {t.id} · {TRANSPORT[t.transport]} · estimate {formatKes(t.estimate.total)}
                          {t.advanceRequested > 0 ? ` · advance ${formatKes(t.advanceApproved ?? t.advanceRequested)}${t.advanceApproved === undefined ? ' requested' : ''}` : ''}
                        </span>
                      </div>
                      <Pill tone={pillTone(st.tone)}>{st.label}</Pill>
                    </div>
                    <p>{t.purpose}</p>
                    <p className="ess-muted">
                      Approvals: {nameOf(t.managerId)} (line manager) → {nameOf(FINANCE_APPROVER)} (Finance)
                      {due && t.status !== 'DECLINED' && t.status !== 'CLOSED' && t.status !== 'SURRENDERED' ? ` · receipts due ${adv?.dueOn ? '' : 'about '}${formatDate(due)}` : ''}
                      {t.perDiemVia === 'PAYROLL' ? ' · per diem paid through payroll' : ''}
                    </p>
                    {declined && <p>Declined: {declined.comment}</p>}
                    {t.status !== 'DECLINED' && t.status !== 'DRAFT' && <Steps steps={TRIP_STEPS} at={tripStep(t.status)} label={`Progress: ${st.label}`} />}
                    <div className="ess-inline-actions ess-row-actions">
                      {t.status === 'DRAFT' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => edit(t)}>
                            Edit
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={() => submitDraft(t)}>
                            Submit
                          </button>
                        </>
                      )}
                      {(t.status === 'ADVANCE_PAID' || (t.status === 'FINANCE_APPROVED' && !t.imprestId)) && t.returnDate <= today && (
                        <button className="btn btn-secondary btn-sm" onClick={() => markTravelled(t.id, ACTOR)}>
                          I’m back
                        </button>
                      )}
                      {adv?.status === 'PAID' && surrenderId !== adv.id && (
                        <button className="btn btn-primary btn-sm" onClick={() => setSurrenderId(adv.id)}>
                          <Receipt size={13} /> Surrender receipts
                        </button>
                      )}
                    </div>
                    {adv && surrenderId === adv.id && <SurrenderForm imprest={adv} onClose={() => setSurrenderId(null)} />}
                  </li>
                );
              }}
            />
          ))}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Petty cash and imprest                                              */
/* ------------------------------------------------------------------ */

export const EssAdvances: React.FC = () => {
  const { allImprests: imprests, requestImprest, imprestBlock, travelToday: today } = useApp();
  const me = useEssMe();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'PETTY_CASH' | 'STANDALONE'>('PETTY_CASH');
  const [purpose, setPurpose] = useState('');
  const [costCentre, setCostCentre] = useState(me.record?.department ?? '');
  const [lines, setLines] = useState<ImprestLineDraft[]>(() => [blankImprestLine(me.record?.department ?? ''), blankImprestLine(me.record?.department ?? '')]);
  const total = draftTotal(lines);
  const overLimit = kind === 'PETTY_CASH' && total > PETTY_CASH_LIMIT;
  const [dueOn, setDueOn] = useState('');
  const [error, setError] = useState('');
  const [surrenderId, setSurrenderId] = useState<string | null>(null);
  const block = imprestBlock(ME);

  const mine = useMemo(
    () => mergeById(imprests.filter((i) => i.staffId === ME), rememberedAdvances()).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn) || b.id.localeCompare(a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imprests, open]
  );
  const outstanding = mine.filter((i) => i.status === 'PAID');
  const owed = outstanding.reduce((n, i) => n + i.amount, 0);
  const nextDue = outstanding.map((i) => i.dueOn).filter((d): d is string => !!d).sort()[0];

  const close = () => {
    setOpen(false);
    setPurpose('');
    setLines([blankImprestLine(costCentre), blankImprestLine(costCentre)]);
    setDueOn('');
    setError('');
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cc = costCentre.trim() || me.record?.department || '';
    const r = requestImprest({ staffId: ME, kind, purpose: purpose.trim(), costCentre: cc, lines: lines.map((l) => ({ ...l, costCentre: l.costCentre || cc })), dueOn: kind === 'STANDALONE' && dueOn ? dueOn : undefined }, ACTOR);
    if (!r.ok || !r.id) return setError(r.reason ?? 'Request not saved.');
    const mgr = me.record ? supervisorFor(me.record, me.hrEmployees) : undefined;
    rememberAdvance({ id: r.id, orgId: me.orgId, staffId: ME, kind, purpose: purpose.trim(), costCentre: cc, amount: total, requestedAmount: total, lines: lines.filter((l) => lineAmount(l) > 0).map((l) => ({ ...l, costCentre: l.costCentre || cc, amount: lineAmount(l) })), requestedOn: today, approverId: mgr?.staffId, status: 'PENDING', events: [] });
    close();
  };

  return (
    <div className="ess-stack">
      <OtherCompanyNote />
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <Banknote size={16} /> {open ? 'Petty cash or imprest' : 'My advances'}
          </h3>
          {!open && (
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
              <Plus size={14} /> Request cash
            </button>
          )}
        </div>

        {!open && (
          <div className="ess-sums">
            <span>
              Outstanding <strong>{formatKes(owed)}</strong>
            </span>
            <span>
              Next receipts due <strong>{nextDue ? formatDate(nextDue) : '—'}</strong>
            </span>
          </div>
        )}
        {block && (
          <div className="ess-notice warn">
            <AlertCircle size={14} /> New advances are on hold: {block}
          </div>
        )}

        {open && (
          <form className="ess-form" onSubmit={submit} noValidate>
            <div className="ess-type-grid" role="radiogroup" aria-label="Kind of advance">
              {(['PETTY_CASH', 'STANDALONE'] as const).map((k) => (
                <button type="button" role="radio" aria-checked={kind === k} key={k} className={`ess-type-chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                  {IMPREST_KIND[k]}
                </button>
              ))}
            </div>
            <div className="ess-form-grid">
              <label className="req-field">
                <span>Default cost centre</span>
                <input className="form-control" value={costCentre} onChange={(e) => setCostCentre(e.target.value)} />
              </label>
              {kind === 'STANDALONE' && (
                <label className="req-field">
                  <span>Receipts due (optional)</span>
                  <input type="date" className="form-control" min={today} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                </label>
              )}
              <label className="req-field ess-span-full">
                <span>What is it for? *</span>
                <input className="form-control" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Refreshments and materials for the induction day" />
              </label>
            </div>
            <h4 className="ess-subhead">Items — add a line for each thing you need</h4>
            <ImprestLinesEditor lines={lines} onChange={setLines} costCentres={[...new Set(me.hrEmployees.filter((x) => x.orgId === me.orgId).map((x) => x.department))].sort()} defaultCostCentre={costCentre.trim() || me.record?.department || ''} limit={kind === 'PETTY_CASH' ? PETTY_CASH_LIMIT : undefined} />
            <p className="ess-hint">
              {kind === 'PETTY_CASH'
                ? `Petty cash is up to ${formatKes(PETTY_CASH_LIMIT)} a request, paid from the office float. Bring receipts within 3 days.`
                : 'An imprest is paid by bank transfer. Bring receipts within 14 days unless you set a date.'}
            </p>
            <ReqError text={error} />
            <div className="ess-form-actions">
              <span className="ess-hint">Your line manager approves; Finance pays</span>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!!block || overLimit || total <= 0}>
                Send request · {formatKes(total)}
              </button>
            </div>
          </form>
        )}

        {!open &&
          (mine.length === 0 ? (
            <div className="ess-empty">
              <Banknote size={28} />
              <strong>No advances</strong>
              <span>Petty cash, imprest and travel advances you take appear here until they are surrendered.</span>
            </div>
          ) : (
            <Capped
              items={mine}
              noun="advances"
              render={(i) => {
                const st = IMPREST_STATUS[i.status];
                const late = overdueDays(i, today);
                return (
                  <li key={i.id} className="ess-request">
                    <div className="ess-request-top">
                      <div>
                        <strong>
                          {IMPREST_KIND[i.kind]} · {formatKes(i.amount)}
                        </strong>
                        <span className="ess-muted">
                          {i.id} · {formatDate(i.requestedOn)} · {i.purpose}{(i.lines?.length ?? 0) > 1 ? ` · ${i.lines!.length} items` : ''}
                        </span>
                      </div>
                      <Pill tone={pillTone(st.tone)}>{st.label}</Pill>
                    </div>
                    {i.status === 'PAID' && (
                      <p className={late ? 'ess-late' : 'ess-muted'}>
                        Outstanding {formatKes(i.amount)}
                        {i.dueOn ? ` · receipts due ${formatDate(i.dueOn)}` : ''}
                        {late ? ` · ${late} day(s) overdue — it may be recovered from your salary` : ''}
                      </p>
                    )}
                    {i.surrender && (
                      <p className="ess-muted">
                        Surrendered {formatDate(i.surrender.on)}: spent {formatKes(i.surrender.spent)}
                        {i.surrender.variance > 0 ? `, ${formatKes(i.surrender.variance)} returned` : i.surrender.variance < 0 ? `, overspent ${formatKes(-i.surrender.variance)}` : ''}
                      </p>
                    )}
                    {i.recovery && <p className="ess-muted">Recovered through payroll ({i.recovery.period}).</p>}
                    {i.status === 'PAID' && surrenderId !== i.id && (
                      <div className="ess-inline-actions ess-row-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => setSurrenderId(i.id)}>
                          <Receipt size={13} /> Surrender receipts
                        </button>
                      </div>
                    )}
                    {surrenderId === i.id && <SurrenderForm imprest={i} onClose={() => setSurrenderId(null)} />}
                  </li>
                );
              }}
            />
          ))}
      </section>
    </div>
  );
};
