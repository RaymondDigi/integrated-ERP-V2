import React, { useState } from 'react';
import { BellRing, CalendarClock, FileCheck2, Landmark, Plus, RefreshCw, Shield, Truck, Wallet } from 'lucide-react';
import { Attachments, ExportCsvButton } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Modal, Panel, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { shipValue } from '../engine';
import type { Shipment } from '../types';
import { ReadOnlyNote, SimBadge } from '../warehousing/ui';
import { milestonesFor } from './data';
import { bondUse, CHARGE_ACCOUNT, CHARGE_LABEL, landedCost, MS_PILL, scheduleRisk } from './engine';
import { useShippingExt } from './store';
import type { Bond, ChargeType, CustomsLicence, Idf, Milestone, TruckBooking, Voyage } from './types';

const openShipments = (list: Shipment[]) => list.filter((s) => s.stage !== 'DELIVERED');

/* ------------------------------------------------------------------ */
/* External milestones and IDF                                         */
/* ------------------------------------------------------------------ */

export const TrackingPage: React.FC = () => {
  const shp = useShippingExt();
  const { state, ops, party, actor } = shp;
  const { readOnly } = useAccess();
  const [tab, setTab] = useState<'milestones' | 'idf'>('milestones');
  const portal = actor.role === 'CUSTOMER';
  const shipments = ops.state.shipments.filter((s) => !portal || s.customerId === actor.customerId);
  const [shipId, setShipId] = useState(openShipments(shipments)[0]?.id ?? shipments[0]?.id ?? '');
  const sh = shipments.find((s) => s.id === shipId);
  const list: Milestone[] = sh ? (state.milestones[sh.id] ?? milestonesFor(sh)) : [];
  const [edit, setEdit] = useState<{ key: string; status: Milestone['status']; ref: string; note: string } | null>(null);
  const late = (m: Milestone) => m.status !== 'APPROVED' && m.due < TODAY;
  return (
    <SuitePage eyebrow="Shipping" title="External tracking" subtitle="Steps done outside the system — client marking approval, stuffing, KEPHIS, inspection, customs, port and bill of lading — plus Import Declaration Forms.">
      <ReadOnlyNote />
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'milestones', label: 'Shipment milestones' },
          { value: 'idf', label: `IDF tracking (${state.idfs.length})` }
        ]}
      />
      {tab === 'idf' ? (
        <IdfTab />
      ) : (
        <>
          <div className="sx-toolbar">
            <select className="form-control" value={shipId} onChange={(e) => setShipId(e.target.value)} aria-label="Shipment">
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} — {party(s.customerId)?.name} · {s.vessel} · {s.stage.toLowerCase()}
                </option>
              ))}
            </select>
            {sh && !readOnly && !portal && (
              <>
                {(['KEPHIS', 'KRA', 'KPA', 'LINE'] as const).map((sys) => (
                  <button key={sys} type="button" className="btn btn-secondary btn-sm" onClick={() => shp.pullExternal(sh.id, sys)} title="Simulated connector — generates the next status">
                    <RefreshCw size={13} /> Pull {sys === 'KRA' ? 'ICMS' : sys === 'LINE' ? 'shipping line' : sys}
                  </button>
                ))}
                <SimBadge text="Simulated connectors" />
              </>
            )}
          </div>
          {sh && (
            <div className="sx-stats">
              <Stat label="Milestones done" value={`${list.filter((m) => m.status === 'APPROVED').length} / ${list.length}`} icon={<FileCheck2 size={17} />} />
              <Stat label="Overdue" value={list.filter(late).length} icon={<CalendarClock size={17} />} tone={list.some(late) ? 'red' : 'green'} />
              <Stat label="Rejected" value={list.filter((m) => m.status === 'REJECTED').length} icon={<Shield size={17} />} tone="gold" />
            </div>
          )}
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Party</th>
                <th>Due</th>
                <th>Status</th>
                <th>Reference</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.key}>
                  <td>
                    <b>{m.name}</b>
                    {m.note && <div className="sx-muted">{m.note}</div>}
                  </td>
                  <td>{m.party}</td>
                  <td className={late(m) ? 'sx-danger-text' : ''}>{fmtDate(m.due)}</td>
                  <td>
                    <Pill status={MS_PILL[m.status]} label={m.status.toLowerCase().replace('_', ' ')} /> {m.source === 'CONNECTOR' && <small className="sx-muted">via connector</small>}
                  </td>
                  <td className="sx-mono">{m.ref ?? '—'}</td>
                  <td>
                    {!readOnly && (!portal || m.key === 'marking') && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit({ key: m.key, status: m.status === 'NOT_STARTED' ? 'SUBMITTED' : 'APPROVED', ref: m.ref ?? '', note: '' })}>
                        Update
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sh && <Attachments owner={`shipment-ext:${sh.id}`} by={actor.name} readOnly={readOnly} title="External documents (inspection report, phyto, B/L, delivery report)" />}
          {edit && sh && (
            <Modal
              size="md"
              title={list.find((m) => m.key === edit.key)?.name ?? ''}
              onClose={() => setEdit(null)}
              footer={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.updateMilestone(sh.id, edit.key, edit.status, edit.ref, edit.note).ok && setEdit(null)}>
                  Save
                </button>
              }
            >
              <div className="sx-grid sx-grid-2">
                <Field label="Status">
                  <select className="form-control" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Milestone['status'] })}>
                    <option value="NOT_STARTED">Not started</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="APPROVED">Approved / done</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </Field>
                <Field label="Reference">
                  <input className="form-control" value={edit.ref} onChange={(e) => setEdit({ ...edit, ref: e.target.value })} placeholder="Certificate, report or B/L no." />
                </Field>
                <Field label="Note" span={2}>
                  <input className="form-control" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                </Field>
              </div>
            </Modal>
          )}
        </>
      )}
    </SuitePage>
  );
};

const IDF_PILL: Record<Idf['status'], string> = { APPLIED: 'SUBMITTED', APPROVED: 'APPROVED', EXPIRED: 'OVERDUE', CANCELLED: 'VOID' };
const IdfTab: React.FC = () => {
  const shp = useShippingExt();
  const { readOnly } = useAccess();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ number: '', description: '', supplier: '', valueUsd: 0, applied: TODAY });
  const [expiry, setExpiry] = useState(addDays(TODAY, 270));
  const cols: Column<Idf>[] = [
    { key: 'n', header: 'IDF', render: (i) => <b className="sx-mono">{i.number}</b> },
    { key: 'd', header: 'Goods', render: (i) => <div className="sx-cell-main"><span>{i.description}</span><small>{i.supplier}</small></div> },
    { key: 'v', header: 'Value USD', render: (i) => i.valueUsd.toLocaleString(), align: 'right' },
    { key: 'e', header: 'Expiry', render: (i) => (i.expiry ? <span className={daysBetween(TODAY, i.expiry) <= 30 ? 'sx-danger-text' : ''}>{fmtDate(i.expiry)}</span> : '—') },
    { key: 's', header: 'Status', render: (i) => <Pill status={IDF_PILL[i.status]} label={i.status.toLowerCase()} /> }
  ];
  const open = shp.state.idfs.find((i) => i.id === openId);
  return (
    <>
      {!readOnly && (
        <div className="sx-toolbar">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Track an IDF
          </button>
        </div>
      )}
      <DataTable rows={shp.state.idfs} columns={cols} rowKey={(i) => i.id} onRowClick={(i) => setOpenId(i.id)} selected={openId} empty="No IDFs" />
      {open && (
        <Drawer title={open.number} subtitle={open.description} badge={<Pill status={IDF_PILL[open.status]} label={open.status.toLowerCase()} />} onClose={() => setOpenId(null)}>
          <DefList items={[['Supplier', open.supplier], ['Customs value', `USD ${open.valueUsd.toLocaleString()}`], ['Applied', fmtDate(open.applied)], ['Approved', open.approved ? fmtDate(open.approved) : '—'], ['Expiry', open.expiry ? fmtDate(open.expiry) : '—']]} />
          {!readOnly && open.status === 'APPLIED' && (
            <div className="sx-inline-form">
              <input className="form-control" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="IDF expiry" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.idfStep(open.id, 'APPROVE', expiry)}>
                Record approval
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.idfStep(open.id, 'CANCEL')}>
                Cancel
              </button>
            </div>
          )}
          <Attachments owner={`idf:${open.id}`} by={shp.actor.name} readOnly={readOnly} title="IDF documents (proforma, approval)" />
          <Timeline items={open.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          size="md"
          title="Track an Import Declaration Form"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.saveIdf(d).ok && setAdding(false)}>
              Save
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="IDF number" required hint="e.g. E2600KE1234567">
              <input className="form-control" value={d.number} onChange={(e) => setD({ ...d, number: e.target.value })} />
            </Field>
            <Field label="Applied on">
              <input className="form-control" type="date" value={d.applied} onChange={(e) => setD({ ...d, applied: e.target.value })} />
            </Field>
            <Field label="Goods" required span={2}>
              <input className="form-control" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="e.g. Polypropylene tea sacks" />
            </Field>
            <Field label="Supplier" required>
              <input className="form-control" value={d.supplier} onChange={(e) => setD({ ...d, supplier: e.target.value })} />
            </Field>
            <Field label="Customs value (USD)" required>
              <input className="form-control" type="number" min="0" value={d.valueUsd || ''} onChange={(e) => setD({ ...d, valueUsd: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Vessel schedule                                                     */
/* ------------------------------------------------------------------ */

export const VesselsPage: React.FC = () => {
  const shp = useShippingExt();
  const { state } = shp;
  const { readOnly } = useAccess();
  const [editing, setEditing] = useState<(Partial<Voyage> & { reason?: string }) | null>(null);
  const affected = (v: Voyage) => state.instructions.filter((si) => si.voyageId === v.id && !['SHIPPED', 'CANCELLED'].includes(si.status));
  const cols: Column<Voyage>[] = [
    { key: 'v', header: 'Vessel', render: (v) => <div className="sx-cell-main"><b>{v.vessel}</b><small>{v.line} · voy {v.voyage}</small></div>, sort: (v) => v.vessel },
    { key: 'c', header: 'Cut-off', render: (v) => <span className={daysBetween(TODAY, v.cutOff) <= 2 && v.cutOff >= TODAY ? 'sx-danger-text' : ''}>{fmtDate(v.cutOff)}</span>, sort: (v) => v.cutOff },
    { key: 'e', header: 'ETD', render: (v) => <div className="sx-cell-main"><span>{fmtDate(v.etd)}</span>{v.etd !== v.originalEtd && <small className="sx-danger-text">was {fmtDate(v.originalEtd)} ({daysBetween(v.originalEtd, v.etd) > 0 ? '+' : ''}{daysBetween(v.originalEtd, v.etd)} d)</small>}</div>, sort: (v) => v.etd },
    { key: 'a', header: 'ETA', render: (v) => fmtDate(v.eta), hideOnMobile: true },
    { key: 'd', header: 'Calls at', render: (v) => v.destinations, hideOnMobile: true },
    { key: 's', header: 'SIs', render: (v) => { const list = affected(v); const risky = list.filter((si) => scheduleRisk(si, v)?.level === 'LATE'); return <span className={risky.length ? 'sx-danger-text' : ''}>{list.length}{risky.length ? ` (${risky.length} at risk)` : ''}</span>; }, align: 'right' }
  ];
  return (
    <SuitePage
      eyebrow="Shipping"
      title="Vessel schedule"
      subtitle="Sailings with cut-off, ETD and ETA. Changing a date notifies every customer whose instruction is on that voyage and flags those that can no longer make it."
      actions={
        !readOnly && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ vessel: '', line: '', voyage: '', port: 'Mombasa', cutOff: addDays(TODAY, 10), etd: addDays(TODAY, 12), eta: addDays(TODAY, 26), destinations: '' })}>
            <Plus size={14} /> Add sailing
          </button>
        )
      }
    >
      <ReadOnlyNote />
      <DataTable rows={state.voyages} columns={cols} rowKey={(v) => v.id} onRowClick={(v) => !readOnly && setEditing(v)} initialSort={{ key: 'e', dir: 'asc' }} />
      {editing && (
        <Modal
          size="lg"
          title={editing.id ? `${editing.vessel} ${editing.voyage}` : 'New sailing'}
          onClose={() => setEditing(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.saveVoyage(editing as Voyage & { reason?: string }).ok && setEditing(null)}>
              Save
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Vessel" required>
              <input className="form-control" value={editing.vessel} onChange={(e) => setEditing({ ...editing, vessel: e.target.value })} />
            </Field>
            <Field label="Voyage" required>
              <input className="form-control" value={editing.voyage} onChange={(e) => setEditing({ ...editing, voyage: e.target.value })} />
            </Field>
            <Field label="Shipping line">
              <input className="form-control" value={editing.line} onChange={(e) => setEditing({ ...editing, line: e.target.value })} />
            </Field>
            <Field label="Calls at">
              <input className="form-control" value={editing.destinations} onChange={(e) => setEditing({ ...editing, destinations: e.target.value })} />
            </Field>
            <Field label="Cut-off">
              <input className="form-control" type="date" value={editing.cutOff} onChange={(e) => setEditing({ ...editing, cutOff: e.target.value })} />
            </Field>
            <Field label="ETD">
              <input className="form-control" type="date" value={editing.etd} onChange={(e) => setEditing({ ...editing, etd: e.target.value })} />
            </Field>
            <Field label="ETA">
              <input className="form-control" type="date" value={editing.eta} onChange={(e) => setEditing({ ...editing, eta: e.target.value })} />
            </Field>
            {editing.id && (
              <Field label="Reason for a date change">
                <input className="form-control" value={editing.reason ?? ''} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} placeholder="e.g. Port congestion at Mombasa" />
              </Field>
            )}
          </div>
          {editing.history && <Timeline items={editing.history} />}
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Bonds and licences                                                  */
/* ------------------------------------------------------------------ */

export const BondsPage: React.FC = () => {
  const shp = useShippingExt();
  const { state, ops } = shp;
  const { readOnly } = useAccess();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<Pick<Bond, 'type' | 'insurer' | 'amount' | 'issued' | 'expiry'>>({ type: 'TRANSIT', insurer: '', amount: 0, issued: TODAY, expiry: addDays(TODAY, 365) });
  const [link, setLink] = useState('');
  const cols: Column<Bond>[] = [
    { key: 'n', header: 'Bond', render: (b) => <div className="sx-cell-main"><b className="sx-mono">{b.number}</b><small>{b.type.toLowerCase().replace('_', ' ')} · {b.insurer}</small></div> },
    { key: 'a', header: 'Amount', render: (b) => kes(b.amount, { compact: true }), align: 'right' },
    {
      key: 'u',
      header: 'Used',
      render: (b) => {
        const u = bondUse(b, ops.state.shipments);
        return (
          <div className="sx-meter-cell">
            <Meter value={Math.min(1, u.pct)} tone={u.pct > 0.9 ? 'red' : u.pct > 0.7 ? 'gold' : 'green'} />
            <small>{Math.round(u.pct * 100)}%</small>
          </div>
        );
      }
    },
    { key: 'e', header: 'Expiry', render: (b) => { const u = bondUse(b, ops.state.shipments); return <span className={u.alert ? 'sx-danger-text' : ''}>{fmtDate(b.expiry)}{u.alert ? ` · ${u.alert}` : ''}</span>; }, sort: (b) => b.expiry },
    { key: 's', header: 'Status', render: (b) => <Pill status={b.status === 'ACTIVE' ? 'ACTIVE' : b.status === 'EXPIRED' ? 'OVERDUE' : 'CLOSED'} label={b.status.toLowerCase()} /> }
  ];
  const open = state.bonds.find((b) => b.id === openId);
  const alerts = state.bonds.filter((b) => bondUse(b, ops.state.shipments).alert).length;
  return (
    <SuitePage
      eyebrow="Shipping"
      title="Customs & transit bonds"
      subtitle="Bonds securing goods under customs control: book them, link shipments against the bond value and get reminders before they expire."
      actions={
        !readOnly && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.sendBondReminders()}>
              <BellRing size={14} /> Send expiry reminders
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> Book a bond
            </button>
          </>
        )
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Active bonds" value={state.bonds.filter((b) => b.status === 'ACTIVE').length} detail={kes(state.bonds.filter((b) => b.status === 'ACTIVE').reduce((x, b) => x + b.amount, 0), { compact: true })} icon={<Shield size={17} />} />
        <Stat label="Expiring / expired" value={alerts} icon={<BellRing size={17} />} tone={alerts ? 'red' : 'green'} />
      </div>
      <DataTable rows={state.bonds} columns={cols} rowKey={(b) => b.id} onRowClick={(b) => setOpenId(b.id)} selected={openId} />
      {open && (
        <Drawer title={open.number} subtitle={`${open.insurer} · ${kes(open.amount)}`} onClose={() => setOpenId(null)}>
          <DefList items={[['Issued', fmtDate(open.issued)], ['Expiry', fmtDate(open.expiry)], ['Free', kes(bondUse(open, ops.state.shipments).free)]]} />
          <h4 className="sx-subhead">Shipments secured</h4>
          <ul className="sx-facts">
            {open.shipmentIds.map((id) => {
              const s = ops.state.shipments.find((x) => x.id === id);
              return <li key={id}>{s ? `${s.number} · ${kes(shipValue(s), { compact: true })} · ${s.stage.toLowerCase()}` : id}</li>;
            })}
            {!open.shipmentIds.length && <li className="sx-muted">None yet</li>}
          </ul>
          {!readOnly && open.status === 'ACTIVE' && (
            <div className="sx-inline-form">
              <select className="form-control" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Shipment to link">
                <option value="">Link a shipment…</option>
                {openShipments(ops.state.shipments)
                  .filter((s) => !open.shipmentIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.number} · {kes(shipValue(s), { compact: true })}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!link} onClick={() => shp.linkBond(open.id, link).ok && setLink('')}>
                Link
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.releaseBond(open.id)}>
                Release bond
              </button>
            </div>
          )}
          <Attachments owner={`bond:${open.id}`} by={shp.actor.name} readOnly={readOnly} title="Bond documents" />
          <Timeline items={open.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          size="md"
          title="Book a bond"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.bookBond(d).ok && setAdding(false)}>
              Book
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Type">
              <select className="form-control" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as Bond['type'] })}>
                <option value="TRANSIT">Transit bond</option>
                <option value="CUSTOMS_GENERAL">General customs bond</option>
                <option value="EXPORT_WAREHOUSE">Export warehouse bond</option>
              </select>
            </Field>
            <Field label="Insurer / bank" required>
              <input className="form-control" value={d.insurer} onChange={(e) => setD({ ...d, insurer: e.target.value })} />
            </Field>
            <Field label="Amount (KES)" required>
              <input className="form-control" type="number" min="0" value={d.amount || ''} onChange={(e) => setD({ ...d, amount: Number(e.target.value) })} />
            </Field>
            <Field label="Issued">
              <input className="form-control" type="date" value={d.issued} onChange={(e) => setD({ ...d, issued: e.target.value })} />
            </Field>
            <Field label="Expiry">
              <input className="form-control" type="date" value={d.expiry} onChange={(e) => setD({ ...d, expiry: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

const L_PILL: Record<CustomsLicence['status'], string> = { APPLIED: 'SUBMITTED', ISSUED: 'ACTIVE', RENEWAL_STARTED: 'OPEN', EXPIRED: 'OVERDUE' };
export const LicencesPage: React.FC = () => {
  const shp = useShippingExt();
  const { readOnly } = useAccess();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ name: '', authority: '', fee: 0 });
  const [issue, setIssue] = useState({ number: '', expiry: addDays(TODAY, 365) });
  const cols: Column<CustomsLicence>[] = [
    { key: 'n', header: 'Licence', render: (l) => <div className="sx-cell-main"><b>{l.name}</b><small>{l.authority}</small></div> },
    { key: 'no', header: 'Number', render: (l) => <span className="sx-mono">{l.number}</span> },
    { key: 'e', header: 'Expiry', render: (l) => (l.expiry ? <span className={daysBetween(TODAY, l.expiry) <= 30 ? 'sx-danger-text' : ''}>{fmtDate(l.expiry)}</span> : '—'), sort: (l) => l.expiry ?? '' },
    { key: 'f', header: 'Fee', render: (l) => kes(l.fee), align: 'right' },
    { key: 's', header: 'Status', render: (l) => <Pill status={L_PILL[l.status]} label={l.status.toLowerCase().replace('_', ' ')} /> }
  ];
  const open = shp.state.licences.find((l) => l.id === openId);
  return (
    <SuitePage
      eyebrow="Shipping"
      title="Customs licences"
      subtitle="Applications for export and customs licences (Tea Board, KRA, KEPHIS, AFA): applied, issued and renewal, with fees and documents."
      actions={
        !readOnly && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> New application
          </button>
        )
      }
    >
      <ReadOnlyNote />
      <DataTable rows={shp.state.licences} columns={cols} rowKey={(l) => l.id} onRowClick={(l) => setOpenId(l.id)} selected={openId} />
      {open && (
        <Drawer title={open.name} subtitle={open.authority} badge={<Pill status={L_PILL[open.status]} label={open.status.toLowerCase().replace('_', ' ')} />} onClose={() => setOpenId(null)}>
          <DefList items={[['Number', open.number], ['Applied', fmtDate(open.applied)], ['Issued', open.issued ? fmtDate(open.issued) : '—'], ['Expiry', open.expiry ? fmtDate(open.expiry) : '—'], ['Fee', kes(open.fee)]]} />
          {!readOnly && ['APPLIED', 'RENEWAL_STARTED'].includes(open.status) && (
            <div className="sx-inline-form">
              <input className="form-control" value={issue.number} onChange={(e) => setIssue({ ...issue, number: e.target.value })} placeholder="Licence number" aria-label="Licence number" />
              <input className="form-control" type="date" value={issue.expiry} onChange={(e) => setIssue({ ...issue, expiry: e.target.value })} aria-label="Expiry" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.licenceStep(open.id, 'ISSUE', issue.number, issue.expiry)}>
                Record issue
              </button>
            </div>
          )}
          {!readOnly && ['ISSUED', 'EXPIRED'].includes(open.status) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.licenceStep(open.id, 'RENEW')}>
              Start renewal
            </button>
          )}
          <Attachments owner={`licence:${open.id}`} by={shp.actor.name} readOnly={readOnly} title="Application documents" />
          <Timeline items={open.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          size="md"
          title="Licence application"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.applyLicence(d).ok && setAdding(false)}>
              Lodge
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Licence" required span={2}>
              <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Tea export licence" />
            </Field>
            <Field label="Authority" required>
              <input className="form-control" value={d.authority} onChange={(e) => setD({ ...d, authority: e.target.value })} placeholder="e.g. Tea Board of Kenya" />
            </Field>
            <Field label="Fee (KES)">
              <input className="form-control" type="number" min="0" value={d.fee || ''} onChange={(e) => setD({ ...d, fee: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Charges and landed cost                                             */
/* ------------------------------------------------------------------ */

export const ChargesPage: React.FC = () => {
  const shp = useShippingExt();
  const { state, ops, wh } = shp;
  const { readOnly } = useAccess();
  const suppliers = ops.finance.snapshot().parties.filter((p) => p.kind === 'SUPPLIER');
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<{ shipmentId: string; type: ChargeType; supplierId: string; amount: number; vat: boolean; reference: string }>({ shipmentId: ops.state.shipments[0]?.id ?? '', type: 'FREIGHT', supplierId: suppliers[0]?.id ?? '', amount: 0, vat: true, reference: '' });
  const goodsCost = (s: Shipment) => {
    const si = state.instructions.find((x) => x.id === s.siId);
    if (si) return round2(si.lines.reduce((x, l) => x + l.netKg * (wh.state.lots.find((lot) => lot.id === l.lotId)?.costPerKg ?? 0), 0));
    return round2(s.lines.reduce((x, l) => x + l.qty * (ops.products.find((p) => p.sku === l.sku)?.cost ?? 0), 0));
  };
  type Row = ReturnType<typeof landedCost> & { s: Shipment };
  const rows: Row[] = ops.state.shipments.map((s) => ({ s, ...landedCost(s, state.charges, goodsCost(s)) }));
  const cols: Column<Row>[] = [
    { key: 'n', header: 'Shipment', render: (r) => <div className="sx-cell-main"><b className="sx-mono">{r.s.number}</b><small>{r.s.destination}</small></div> },
    { key: 'g', header: 'Goods at cost', render: (r) => kes(r.goodsCost, { compact: true }), align: 'right' },
    { key: 'c', header: 'Charges', render: (r) => kes(r.chargeTotal, { compact: true }), align: 'right' },
    { key: 'l', header: 'Landed cost', render: (r) => <b>{kes(r.landed, { compact: true })}</b>, align: 'right' },
    { key: 'v', header: 'Sales value', render: (r) => kes(r.value, { compact: true }), align: 'right', hideOnMobile: true },
    { key: 'm', header: 'Margin', render: (r) => <span className={r.margin < 0 ? 'sx-danger-text' : 'sx-success-text'}>{Math.round(r.marginPct * 100)}%</span>, align: 'right' }
  ];
  const sup = (id: string) => suppliers.find((p) => p.id === id)?.name ?? id;
  return (
    <SuitePage
      eyebrow="Shipping"
      title="Charges & landed cost"
      subtitle="Book freight, port, KEPHIS, clearing, levies and haulage against a shipment, send them to Finance as supplier bills and see the landed cost and margin."
      actions={
        <>
          <ExportCsvButton name="shipment-charges" header={['shipment', 'type', 'supplier', 'reference', 'amount', 'account', 'bill']} rows={() => state.charges.map((c) => [ops.state.shipments.find((s) => s.id === c.shipmentId)?.number ?? '', CHARGE_LABEL[c.type], sup(c.supplierId), c.reference, c.amount, CHARGE_ACCOUNT[c.type], c.billNumber ?? ''])} />
          {!readOnly && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={14} /> Book a charge
            </button>
          )}
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Charges booked" value={kes(state.charges.reduce((x, c) => x + c.amount, 0), { compact: true })} detail={`${state.charges.length} charges`} icon={<Wallet size={17} />} />
        <Stat label="Not yet billed" value={state.charges.filter((c) => !c.billId).length} icon={<Landmark size={17} />} tone="gold" />
      </div>
      <Panel title="Charges" subtitle="Each goes to Finance as a draft supplier bill against the expense account shown">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Shipment</th>
              <th>Charge</th>
              <th>Supplier · ref</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Account</th>
              <th>Finance</th>
            </tr>
          </thead>
          <tbody>
            {state.charges.map((c) => (
              <tr key={c.id}>
                <td className="sx-mono">{ops.state.shipments.find((s) => s.id === c.shipmentId)?.number}</td>
                <td>{CHARGE_LABEL[c.type]}</td>
                <td>
                  {sup(c.supplierId)} · {c.reference}
                </td>
                <td style={{ textAlign: 'right' }}>{c.amount.toLocaleString()}</td>
                <td className="sx-mono">{CHARGE_ACCOUNT[c.type]}</td>
                <td>
                  {c.billNumber ? (
                    <span className="sx-mono">{c.billNumber}</span>
                  ) : !readOnly ? (
                    <span className="sx-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.billCharge(c.id)}>
                        Send to Finance
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.removeCharge(c.id)}>
                        Remove
                      </button>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Landed cost by shipment" subtitle="Goods at lot cost (or item cost) plus every charge">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.s.id} />
      </Panel>
      {adding && (
        <Modal
          size="md"
          title="Book a shipment charge"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.addCharge(d).ok && setAdding(false)}>
              Book
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Shipment" required>
              <select className="form-control" value={d.shipmentId} onChange={(e) => setD({ ...d, shipmentId: e.target.value })}>
                {ops.state.shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number} · {s.destination}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Charge">
              <select className="form-control" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as ChargeType })}>
                {Object.entries(CHARGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Supplier" required>
              <select className="form-control" value={d.supplierId} onChange={(e) => setD({ ...d, supplierId: e.target.value })}>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Supplier invoice / ref" required>
              <input className="form-control" value={d.reference} onChange={(e) => setD({ ...d, reference: e.target.value })} />
            </Field>
            <Field label="Amount (KES, excl. VAT)" required>
              <input className="form-control" type="number" min="0" value={d.amount || ''} onChange={(e) => setD({ ...d, amount: Number(e.target.value) })} />
            </Field>
            <Field label="VAT">
              <select className="form-control" value={d.vat ? 'Y' : 'N'} onChange={(e) => setD({ ...d, vat: e.target.value === 'Y' })}>
                <option value="Y">16% VAT</option>
                <option value="N">Exempt / zero-rated</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Truck bookings for border clearance                                  */
/* ------------------------------------------------------------------ */

const TB_PILL: Record<TruckBooking['status'], string> = { REQUESTED: 'SUBMITTED', ASSIGNED: 'APPROVED', DONE: 'POSTED', CANCELLED: 'VOID' };
export const TrucksPage: React.FC = () => {
  const shp = useShippingExt();
  const { state, actor, party, ops } = shp;
  const { readOnly } = useAccess();
  const portal = actor.role === 'CUSTOMER';
  const customers = ops.finance.snapshot().parties.filter((p) => p.kind === 'CUSTOMER');
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState<Pick<TruckBooking, 'customerId' | 'border' | 'date' | 'trucks' | 'kg'> & { siNumber?: string }>({ customerId: portal ? (actor.customerId ?? '') : 'c4', border: 'Malaba', date: addDays(TODAY, 3), trucks: 1, kg: 20_000 });
  const rows = state.trucks.filter((t) => !portal || t.customerId === actor.customerId);
  const cols: Column<TruckBooking>[] = [
    { key: 'n', header: 'Booking', render: (t) => <b className="sx-mono">{t.number}</b> },
    { key: 'c', header: 'Customer', render: (t) => <div className="sx-cell-main"><span>{party(t.customerId)?.name}</span><small>{t.siNumber ?? ''}</small></div> },
    { key: 'b', header: 'Border', render: (t) => t.border },
    { key: 'd', header: 'Date', render: (t) => fmtDate(t.date), sort: (t) => t.date },
    { key: 't', header: 'Trucks · kg', render: (t) => `${t.trucks} · ${t.kg.toLocaleString()}`, align: 'right' },
    { key: 'l', header: 'Load', render: (t) => t.loadId ? <span className="sx-mono">{shp.wh.state.loads.find((l) => l.id === t.loadId)?.number ?? '—'}</span> : '—', hideOnMobile: true },
    { key: 's', header: 'Status', render: (t) => <Pill status={TB_PILL[t.status]} label={t.status.toLowerCase()} /> },
    {
      key: 'a',
      header: '',
      render: (t) =>
        readOnly ? null : (
          <span className="sx-actions">
            {t.status === 'REQUESTED' && !portal && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.truckStep(t.id, 'ASSIGN')}>
                Plan load
              </button>
            )}
            {t.status === 'ASSIGNED' && !portal && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.truckStep(t.id, 'DONE')}>
                Cleared
              </button>
            )}
            {['REQUESTED', 'ASSIGNED'].includes(t.status) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => shp.truckStep(t.id, 'CANCEL')}>
                Cancel
              </button>
            )}
          </span>
        )
    }
  ];
  return (
    <SuitePage
      eyebrow={portal ? 'Customer portal' : 'Shipping'}
      title="Truck bookings — border clearance"
      subtitle="Customers book trucks for cross-border tea (Malaba, Busia, Namanga…). Planning a booking creates a load in Warehousing › Transport for carrier tendering."
      actions={
        !readOnly && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Truck size={14} /> Book trucks
          </button>
        )
      }
    >
      <ReadOnlyNote />
      <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} empty="No truck bookings" />
      {adding && (
        <Modal
          size="md"
          title="Book trucks for border clearance"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.requestTrucks(d).ok && setAdding(false)}>
              Request
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Customer" required>
              <select className="form-control" value={d.customerId} disabled={portal} onChange={(e) => setD({ ...d, customerId: e.target.value })}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Border">
              <select className="form-control" value={d.border} onChange={(e) => setD({ ...d, border: e.target.value as TruckBooking['border'] })}>
                {['Malaba', 'Busia', 'Namanga', 'Taveta', 'Isebania'].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input className="form-control" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
            </Field>
            <Field label="Shipping instruction">
              <select className="form-control" value={d.siNumber ?? ''} onChange={(e) => setD({ ...d, siNumber: e.target.value || undefined })}>
                <option value="">None</option>
                {state.instructions
                  .filter((si) => si.customerId === d.customerId && !['SHIPPED', 'CANCELLED'].includes(si.status))
                  .map((si) => (
                    <option key={si.id}>{si.number}</option>
                  ))}
              </select>
            </Field>
            <Field label="Trucks">
              <input className="form-control" type="number" min="1" value={d.trucks} onChange={(e) => setD({ ...d, trucks: Number(e.target.value) })} />
            </Field>
            <Field label="Total kg">
              <input className="form-control" type="number" min="0" value={d.kg || ''} onChange={(e) => setD({ ...d, kg: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

