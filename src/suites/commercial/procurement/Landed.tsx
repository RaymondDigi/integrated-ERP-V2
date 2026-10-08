import React, { useEffect, useState } from 'react';
import { Anchor, Calculator, CheckCircle2, Plus, Ship } from 'lucide-react';
import { useCommercial } from '../store';
import { kes, round2 } from '../../finance/engine';
import { DataTable, DefList, Drawer, Empty, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { useProcurementExt } from './ext/store';
import { label, ReadOnlyNote, Tabs } from './ext/ui';
import type { ClearanceFile, LandedCost } from './ext/types';

type ChargeType = LandedCost['charges'][number]['type'];
const CHARGE_TYPES: ChargeType[] = ['FREIGHT', 'DUTY', 'CLEARING', 'INSURANCE', 'LABOUR', 'OTHER'];
const OWNER_LABEL: Record<ClearanceFile['ownerType'], string> = { OWN: 'Own goods', SUBSIDIARY: 'Group subsidiary', THIRD_PARTY: 'Third-party client' };

export const LandedPage: React.FC = () => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const [tab, setTab] = useState<'landed' | 'clearing'>('landed');
  const [openLc, setOpenLc] = useState<string | null>(null);
  const [openCf, setOpenCf] = useState<string | null>(null);
  const [newLc, setNewLc] = useState(false);
  const [newCf, setNewCf] = useState(false);
  useEffect(() => {
    const f = ext.page?.focus;
    if (!f) return;
    if (f === 'clearing') setTab('clearing');
    else if (ext.state.clearance.some((x) => x.id === f)) {
      setTab('clearing');
      setOpenCf(f);
    } else setOpenLc(f);
  }, [ext.page, ext.state.clearance]);
  const po = (id: string) => state.purchaseOrders.find((o) => o.id === id);
  const lcCols: Column<LandedCost>[] = [
    { key: 'n', header: 'Sheet', render: (l) => <b className="sx-mono">{l.number}</b>, sort: (l) => l.number, width: 120 },
    { key: 'p', header: 'Purchase order', render: (l) => <div className="sx-cell-main"><span>{po(l.poId)?.number}</span><small>{party(po(l.poId)?.supplierId ?? '')?.name}</small></div> },
    { key: 'c', header: 'Charges', render: (l) => l.charges.map((c) => label(c.type)).join(', ') || '—', hideOnMobile: true },
    { key: 'a', header: 'Allocated by', render: (l) => (l.allocation === 'VALUE' ? 'Value' : 'Quantity'), hideOnMobile: true },
    { key: 'v', header: 'Total', render: (l) => kes(round2(l.charges.reduce((a, c) => a + c.amount, 0))), align: 'right' },
    { key: 's', header: 'Status', render: (l) => <Pill status={l.status === 'POSTED' ? 'POSTED' : 'DRAFT'} label={label(l.status)} /> }
  ];
  const cfCols: Column<ClearanceFile>[] = [
    { key: 'n', header: 'File', render: (f) => <b className="sx-mono">{f.number}</b>, sort: (f) => f.number, width: 120 },
    { key: 'g', header: 'Goods', render: (f) => <div className="sx-cell-main"><span>{f.goods}</span><small>{f.direction === 'IMPORT' ? 'Import' : 'Export'} · {OWNER_LABEL[f.ownerType]} · {f.client}</small></div> },
    { key: 'a', header: 'Agent · entry', render: (f) => `${f.agent} · ${f.entryNo || '—'}`, hideOnMobile: true },
    { key: 'm', header: 'Progress', render: (f) => `${f.milestones.filter((m) => m.done).length}/${f.milestones.length}` },
    { key: 'i', header: 'Billing', render: (f) => (f.invoiceId ? <Pill status="POSTED" label="Invoiced" /> : f.ownerType === 'OWN' ? 'Landed cost' : <Pill status="DRAFT" label="Open" />) }
  ];
  const lc = ext.state.landed.find((l) => l.id === openLc);
  const cf = ext.state.clearance.find((f) => f.id === openCf);
  return (
    <SuitePage
      eyebrow="Imports"
      title="Landed cost & clearing"
      subtitle="Freight, duty, clearing, insurance and labour spread over received goods to give the true item cost; clearing files tracked for our own imports and for clients."
      actions={
        tab === 'landed' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewLc(true)}>
            <Plus size={15} /> New landed-cost sheet
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewCf(true)}>
            <Plus size={15} /> Open clearing file
          </button>
        )
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Draft sheets" value={ext.state.landed.filter((l) => l.status === 'DRAFT').length} icon={<Calculator size={17} />} tone="gold" onClick={() => setTab('landed')} />
        <Stat label="Posted" value={ext.state.landed.filter((l) => l.status === 'POSTED').length} icon={<CheckCircle2 size={17} />} />
        <Stat label="Open clearing files" value={ext.state.clearance.filter((f) => !f.milestones.every((m) => m.done)).length} icon={<Anchor size={17} />} tone="blue" onClick={() => setTab('clearing')} />
        <Stat label="To invoice" value={ext.state.clearance.filter((f) => f.ownerType !== 'OWN' && !f.invoiceId).length} detail="Subsidiary and client files" icon={<Ship size={17} />} onClick={() => setTab('clearing')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['landed', 'Landed cost', ext.state.landed.length], ['clearing', 'Clearing & forwarding', ext.state.clearance.length]]} />
      {tab === 'landed' && <DataTable rows={ext.state.landed} columns={lcCols} rowKey={(l) => l.id} onRowClick={(l) => setOpenLc(l.id)} empty={<Empty icon={<Calculator size={20} />} title="No landed-cost sheets" />} />}
      {tab === 'clearing' && <DataTable rows={ext.state.clearance} columns={cfCols} rowKey={(f) => f.id} onRowClick={(f) => setOpenCf(f.id)} empty={<Empty icon={<Anchor size={20} />} title="No clearing files" />} />}
      {lc && <LandedDrawer l={lc} onClose={() => setOpenLc(null)} />}
      {cf && <ClearanceDrawer f={cf} onClose={() => setOpenCf(null)} />}
      {newLc && <NewLandedModal onClose={() => setNewLc(false)} onDone={(id) => (setNewLc(false), setOpenLc(id))} />}
      {newCf && <NewClearanceModal onClose={() => setNewCf(false)} onDone={(id) => (setNewCf(false), setOpenCf(id))} />}
    </SuitePage>
  );
};

const NewLandedModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const pos = state.purchaseOrders.filter((o) => o.status === 'APPROVED' && o.lines.some((l) => l.received > 0));
  const [poId, setPoId] = useState(pos[0]?.id ?? '');
  const [alloc, setAlloc] = useState<LandedCost['allocation']>('VALUE');
  return (
    <Modal
      size="md"
      title="New landed-cost sheet"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = ext.plan.createLanded(poId, alloc);
            if (r.ok && r.id) onDone(r.id);
          }}
        >
          Create
        </button>
      }
    >
      <Field label="Purchase order (received)">
        <select className="form-control" value={poId} onChange={(e) => setPoId(e.target.value)}>
          <option value="">Choose…</option>
          {pos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.number} — {party(o.supplierId)?.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Spread charges by">
        <select className="form-control" value={alloc} onChange={(e) => setAlloc(e.target.value as LandedCost['allocation'])}>
          <option value="VALUE">Line value</option>
          <option value="QTY">Quantity received</option>
        </select>
      </Field>
    </Modal>
  );
};

const LandedDrawer: React.FC<{ l: LandedCost; onClose: () => void }> = ({ l, onClose }) => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const [ch, setCh] = useState({ type: 'FREIGHT' as ChargeType, amount: 0, supplierId: '', ref: '' });
  const po = state.purchaseOrders.find((o) => o.id === l.poId);
  const rows = po ? ext.plan.allocate(l) : [];
  const total = round2(l.charges.reduce((a, c) => a + c.amount, 0));
  return (
    <Drawer
      wide
      title={`Landed cost ${l.number}`}
      subtitle={`${po?.number} · ${party(po?.supplierId ?? '')?.name} · by ${l.allocation === 'VALUE' ? 'value' : 'quantity'}`}
      badge={<Pill status={l.status === 'POSTED' ? 'POSTED' : 'DRAFT'} label={label(l.status)} />}
      onClose={onClose}
      footer={
        l.status === 'DRAFT' ? (
          <>
            <span className="sx-editor-total">
              Charges <b>{kes(total)}</b>
            </span>
            <span className="sx-grow" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.postLanded(l.id)}>
              Post — update item costs and raise bills
            </button>
          </>
        ) : undefined
      }
    >
      <h3>Charges</h3>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Billed by</th>
            <th>Reference</th>
            <th className="r">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {l.charges.map((c) => (
            <tr key={c.id}>
              <td>{label(c.type)}</td>
              <td>{party(c.supplierId)?.name}</td>
              <td>{c.ref}</td>
              <td className="r">{kes(c.amount)}</td>
              <td>
                {l.status === 'DRAFT' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.removeLandedCharge(l.id, c.id)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {l.status === 'DRAFT' && (
        <div className="sx-grid">
          <Field label="Charge">
            <select className="form-control" value={ch.type} onChange={(e) => setCh({ ...ch, type: e.target.value as ChargeType })}>
              {CHARGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'LABOUR' ? 'Labour (handling, stuffing)' : label(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billed by">
            <PartySelect kind="SUPPLIER" value={ch.supplierId} onChange={(v) => setCh({ ...ch, supplierId: v })} />
          </Field>
          <Field label="Their reference">
            <input className="form-control" value={ch.ref} onChange={(e) => setCh({ ...ch, ref: e.target.value })} />
          </Field>
          <Field label="Amount (KES)">
            <input className="form-control" type="number" min="0" value={ch.amount || ''} onChange={(e) => setCh({ ...ch, amount: Number(e.target.value) })} />
          </Field>
          <Field label=" ">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.addLandedCharge(l.id, ch).ok && setCh({ ...ch, amount: 0, ref: '' })}>
              Add charge
            </button>
          </Field>
        </div>
      )}
      <h3>Allocation</h3>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Received</th>
            <th className="r">PO price</th>
            <th className="r">Share</th>
            <th className="r">Per unit</th>
            <th className="r">Landed unit cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line.id}>
              <td>{r.line.description}</td>
              <td className="r">{r.line.received}</td>
              <td className="r">{kes(r.line.price)}</td>
              <td className="r">{kes(r.share)}</td>
              <td className="r">{kes(r.perUnit)}</td>
              <td className="r">
                <b>{kes(r.landedUnit)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {l.bills.length > 0 && <DefList items={[['Bills in Finance', l.bills.join(', ')], ['Posted by', l.postedBy ?? '']]} />}
      <h3>History</h3>
      <Timeline items={l.history} />
    </Drawer>
  );
};

const NewClearanceModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const [d, setD] = useState({ direction: 'IMPORT' as ClearanceFile['direction'], ownerType: 'OWN' as ClearanceFile['ownerType'], client: 'Chai Trading Company Ltd', customerId: '', poId: '', agent: 'Siginon Freight', entryNo: '', goods: '', feePct: 0 });
  return (
    <Modal
      title="Open a clearing & forwarding file"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = ext.plan.createClearance({ ...d, customerId: d.customerId || undefined, poId: d.poId || undefined });
            if (r.ok && r.id) onDone(r.id);
          }}
        >
          Open file
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Direction">
          <select className="form-control" value={d.direction} onChange={(e) => setD({ ...d, direction: e.target.value as ClearanceFile['direction'] })}>
            <option value="IMPORT">Import</option>
            <option value="EXPORT">Export</option>
          </select>
        </Field>
        <Field label="Whose goods">
          <select className="form-control" value={d.ownerType} onChange={(e) => setD({ ...d, ownerType: e.target.value as ClearanceFile['ownerType'], feePct: e.target.value === 'OWN' ? 0 : 5 })}>
            {(Object.keys(OWNER_LABEL) as ClearanceFile['ownerType'][]).map((k) => (
              <option key={k} value={k}>
                {OWNER_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {d.ownerType !== 'OWN' ? (
          <Field label="Client (invoiced)" required>
            <PartySelect kind="CUSTOMER" value={d.customerId} onChange={(v) => setD({ ...d, customerId: v, client: party(v)?.name ?? '' })} />
          </Field>
        ) : (
          <Field label="Purchase order">
            <select className="form-control" value={d.poId} onChange={(e) => setD({ ...d, poId: e.target.value })}>
              <option value="">—</option>
              {state.purchaseOrders
                .filter((o) => o.status === 'APPROVED')
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} — {party(o.supplierId)?.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="Clearing agent" required>
          <input className="form-control" value={d.agent} onChange={(e) => setD({ ...d, agent: e.target.value })} />
        </Field>
        <Field label="Customs entry no.">
          <input className="form-control" value={d.entryNo} onChange={(e) => setD({ ...d, entryNo: e.target.value })} placeholder="e.g. 24MBAIM400123" />
        </Field>
        <Field label="Agency fee %">
          <input className="form-control" type="number" min="0" value={d.feePct} onChange={(e) => setD({ ...d, feePct: Number(e.target.value) })} />
        </Field>
        <Field label="Goods" required span={2}>
          <input className="form-control" value={d.goods} onChange={(e) => setD({ ...d, goods: e.target.value })} placeholder="e.g. 2 × 40ft — tea packaging film from India" />
        </Field>
      </div>
    </Modal>
  );
};

const ClearanceDrawer: React.FC<{ f: ClearanceFile; onClose: () => void }> = ({ f, onClose }) => {
  const ext = useProcurementExt();
  const [ch, setCh] = useState({ type: '', amount: 0 });
  const disb = round2(f.charges.reduce((a, c) => a + c.amount, 0));
  return (
    <Drawer
      wide
      title={`Clearing file ${f.number}`}
      subtitle={`${f.direction === 'IMPORT' ? 'Import' : 'Export'} · ${OWNER_LABEL[f.ownerType]} · ${f.client}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Disbursements <b>{kes(disb)}</b>
            {f.feePct > 0 && ` + ${f.feePct}% fee`}
          </span>
          <span className="sx-grow" />
          {f.ownerType !== 'OWN' && !f.invoiceId && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.invoiceClearance(f.id)}>
              Invoice client
            </button>
          )}
          {f.ownerType === 'OWN' && f.poId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.go('landed', null)}>
              Cost via landed cost
            </button>
          )}
        </>
      }
    >
      <DefList items={[['Goods', f.goods], ['Agent', f.agent], ['Entry no.', f.entryNo || '—'], ['Invoice', f.invoiceId ? 'Raised in Finance' : '—']]} />
      <h3>Milestones</h3>
      <table className="sx-table">
        <tbody>
          {f.milestones.map((m) => (
            <tr key={m.key}>
              <td>{m.done ? <CheckCircle2 size={14} /> : null}</td>
              <td>{m.label}</td>
              <td>{m.done ? new Date(m.done).toLocaleString() : <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.tickMilestone(f.id, m.key)}>Mark done</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Charges and disbursements</h3>
      <table className="sx-table">
        <tbody>
          {f.charges.map((c, i) => (
            <tr key={i}>
              <td>{c.type}</td>
              <td className="r">{kes(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!f.invoiceId && (
        <div className="prx-inline">
          <input className="form-control" placeholder="Charge e.g. KPA port charges" value={ch.type} onChange={(e) => setCh({ ...ch, type: e.target.value })} aria-label="Charge" />
          <input className="form-control" type="number" min="0" style={{ maxWidth: 140 }} value={ch.amount || ''} onChange={(e) => setCh({ ...ch, amount: Number(e.target.value) })} aria-label="Amount" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.addClearanceCharge(f.id, ch.type, ch.amount).ok && setCh({ type: '', amount: 0 })}>
            Add
          </button>
        </div>
      )}
      <h3>History</h3>
      <Timeline items={f.history} />
    </Drawer>
  );
};
