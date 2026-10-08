import React, { useState } from 'react';
import { CheckCircle2, Container, PackageCheck, PenLine, Plus, Printer, Scale, Truck } from 'lucide-react';
import { SignModal, type ESignature } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { fmtDate } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useShippingExt } from '../shipping/store';
import { useDocCtx } from '../shipping/useDocCtx';
import { CONTAINER_SPEC, locLabel, planCargoKg, vgmMethod2 } from './engine';
import { useWarehouseExt } from './store';
import type { ContainerType, LoadingPlan, PickList } from './types';
import { num, ReadOnlyNote, SimBadge } from './ui';

type Tab = 'pick' | 'load' | 'pod';

export const OutboundPage: React.FC = () => {
  const { state, ops, createPickList } = useWarehouseExt();
  const shp = useShippingExt();
  const { readOnly } = useAccess();
  const [tab, setTab] = useState<Tab>('pick');
  const [pickId, setPickId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState(false);
  const [pod, setPod] = useState<string | null>(null);
  const toPick = shp.state.instructions.filter((si) => ['CONFIRMED', 'IN_PROGRESS'].includes(si.status) && !state.pickLists.some((p) => p.siId === si.id));
  const pcols: Column<PickList>[] = [
    { key: 'n', header: 'Pick list', render: (p) => <b className="sx-mono">{p.number}</b> },
    { key: 's', header: 'Instruction', render: (p) => p.siNumber },
    { key: 'l', header: 'Lines', render: (p) => `${p.lines.filter((l) => l.picked).length}/${p.lines.length} picked` },
    { key: 'b', header: 'Bags', render: (p) => p.lines.reduce((x, l) => x + l.bags, 0), align: 'right' },
    { key: 'st', header: 'Status', render: (p) => <Pill status={{ OPEN: 'OPEN', PICKED: 'APPROVED', PACKED: 'POSTED' }[p.status]} label={p.status.toLowerCase()} /> }
  ];
  const lcols: Column<LoadingPlan>[] = [
    { key: 'n', header: 'Plan', render: (p) => <b className="sx-mono">{p.number}</b> },
    { key: 'r', header: 'For', render: (p) => p.ref },
    { key: 'c', header: 'Container', render: (p) => `${p.container || '—'} · ${p.containerType}` },
    { key: 'k', header: 'Cargo kg', render: (p) => num(planCargoKg(p.lines)), align: 'right' },
    { key: 'f', header: 'Fill', render: (p) => <div className="sx-meter-cell"><Meter value={planCargoKg(p.lines) / CONTAINER_SPEC[p.containerType].maxKg} /><small>{Math.round((planCargoKg(p.lines) / CONTAINER_SPEC[p.containerType].maxKg) * 100)}%</small></div>, hideOnMobile: true },
    { key: 'v', header: 'VGM', render: (p) => (p.vgm ? `${num(p.vgm.grossKg)} kg` : <span className="sx-danger-text">Not certified</span>) },
    { key: 's', header: 'Status', render: (p) => <Pill status={p.status === 'STUFFED' ? 'POSTED' : 'DRAFT'} label={p.status.toLowerCase()} /> }
  ];
  const deliveries = ops.commercial.state.deliveries;
  type D = (typeof deliveries)[number];
  const dcols: Column<D>[] = [
    { key: 'n', header: 'Delivery', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number },
    { key: 'c', header: 'Customer', render: (d) => ops.commercial.party(ops.commercial.state.orders.find((o) => o.id === d.orderId)?.customerId ?? '')?.name ?? '—' },
    { key: 'd', header: 'Dispatched', render: (d) => fmtDate(d.date), sort: (d) => d.date },
    { key: 'v', header: 'Vehicle / trip', render: (d) => `${d.vehicle}${ops.state.trips.find((t) => t.deliveryRef === d.number) ? ` · ${ops.state.trips.find((t) => t.deliveryRef === d.number)?.number}` : ''}`, hideOnMobile: true },
    { key: 's', header: 'Status', render: (d) => <Pill status={d.status === 'DELIVERED' ? 'POSTED' : 'OPEN'} label={d.status === 'DELIVERED' ? 'Delivered' : 'In transit'} /> },
    {
      key: 'p',
      header: 'Proof of delivery',
      render: (d) => {
        const p = state.pods.find((x) => x.deliveryId === d.id);
        return p ? (
          <span className="sx-success-text">
            <CheckCircle2 size={13} /> {p.receivedBy} · e-signed
          </span>
        ) : readOnly ? (
          '—'
        ) : (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setPod(d.id)}>
            <PenLine size={12} /> Sign POD
          </button>
        );
      }
    }
  ];
  const pick = state.pickLists.find((p) => p.id === pickId);
  // A plan just created is opened by its number
  const plan = state.loadingPlans.find((p) => p.id === planId || p.number === planId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Pick, pack & load"
      subtitle="Pick lists from confirmed shipping instructions (first-expiry-first-out), container loading plans with the VGM certificate, and proof of delivery for local dispatches."
      actions={
        tab === 'load' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewPlan(true)}>
            <Plus size={15} /> New loading plan
          </button>
        ) : undefined
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Instructions to pick" value={toPick.length} detail={toPick.map((s) => s.number).join(', ') || 'None waiting'} icon={<PackageCheck size={17} />} tone={toPick.length ? 'gold' : 'green'} />
        <Stat label="Open pick lists" value={state.pickLists.filter((p) => p.status !== 'PACKED').length} icon={<PackageCheck size={17} />} tone="blue" />
        <Stat label="Containers to stuff" value={state.loadingPlans.filter((p) => p.status === 'DRAFT').length} icon={<Container size={17} />} tone="violet" onClick={() => setTab('load')} />
        <Stat label="Deliveries without POD" value={deliveries.filter((d) => !state.pods.some((p) => p.deliveryId === d.id)).length} icon={<Truck size={17} />} tone="slate" onClick={() => setTab('pod')} />
      </div>
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'pick', label: 'Pick lists', count: state.pickLists.length }, { value: 'load', label: 'Loading plans & VGM', count: state.loadingPlans.length }, { value: 'pod', label: 'Deliveries & POD', count: deliveries.length }]} />
      </div>
      {tab === 'pick' && (
        <>
          {toPick.length > 0 && !readOnly && (
            <div className="sx-actions">
              {toPick.map((si) => (
                <button key={si.id} type="button" className="btn btn-secondary btn-sm" onClick={() => createPickList(si.id, si.number)}>
                  <Plus size={14} /> Release pick list for {si.number}
                </button>
              ))}
            </div>
          )}
          <DataTable rows={state.pickLists} columns={pcols} rowKey={(p) => p.id} onRowClick={(p) => setPickId(p.id)} empty="No pick lists yet — release one from a confirmed instruction" />
        </>
      )}
      {tab === 'load' && <DataTable rows={state.loadingPlans} columns={lcols} rowKey={(p) => p.id} onRowClick={(p) => setPlanId(p.id)} empty="No loading plans yet" />}
      {tab === 'pod' && <DataTable rows={deliveries} columns={dcols} rowKey={(d) => d.id} initialSort={{ key: 'd', dir: 'desc' }} />}
      {pick && <PickDrawer p={pick} onClose={() => setPickId(null)} />}
      {plan && <PlanDrawer p={plan} onClose={() => setPlanId(null)} />}
      {newPlan && <NewPlanModal onClose={() => setNewPlan(false)} onMade={(id) => (setNewPlan(false), setPlanId(id))} />}
      {pod && <PodModal deliveryId={pod} onClose={() => setPod(null)} />}
    </SuitePage>
  );
};

const PickDrawer: React.FC<{ p: PickList; onClose: () => void }> = ({ p, onClose }) => {
  const { state, confirmPick, packList } = useWarehouseExt();
  const { readOnly } = useAccess();
  return (
    <Drawer title={p.number} subtitle={`For ${p.siNumber}`} badge={<Pill status={{ OPEN: 'OPEN', PICKED: 'APPROVED', PACKED: 'POSTED' }[p.status]} label={p.status.toLowerCase()} />} onClose={onClose} footer={!readOnly && p.status === 'PICKED' ? <button type="button" className="btn btn-primary btn-sm" onClick={() => packList(p.id)}>Pack and mark</button> : undefined}>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>From</th>
            <th style={{ textAlign: 'right' }}>Bags</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => {
            const lot = state.lots.find((x) => x.id === l.lotId);
            return (
              <tr key={l.lotId}>
                <td>
                  <b className="sx-mono">{lot?.lotNo}</b> {lot?.garden} {lot?.grade}
                </td>
                <td>{locLabel(state.locations.find((x) => x.id === l.locationId))}</td>
                <td style={{ textAlign: 'right' }}>{l.bags}</td>
                <td style={{ textAlign: 'right' }}>{num(l.kg)}</td>
                <td>
                  {l.picked ? (
                    <CheckCircle2 size={15} className="sx-success-text" />
                  ) : (
                    !readOnly && (
                      <button type="button" className="btn btn-secondary btn-xs" onClick={() => confirmPick(p.id, l.lotId)}>
                        Picked
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sx-note">Lines are ordered first-expiry-first-out. Stores confirms each pick; packing marks the bags with the buyer’s markings.</p>
      <Timeline items={p.history} />
    </Drawer>
  );
};

const NewPlanModal: React.FC<{ onClose: () => void; onMade: (id: string) => void }> = ({ onClose, onMade }) => {
  const { state, ops, createLoadingPlan } = useWarehouseExt();
  const shp = useShippingExt();
  const sis = shp.state.instructions.filter((si) => ['CONFIRMED', 'IN_PROGRESS'].includes(si.status));
  const [siId, setSiId] = useState(sis[0]?.id ?? '');
  const [type, setType] = useState<ContainerType>('20GP');
  const si = sis.find((x) => x.id === siId);
  const lots = state.lots.filter((l) => l.reservedFor === si?.number && l.reservedKg > 0);
  const sh = ops.state.shipments.find((x) => x.siId === siId);
  const base = si?.stuffingBase ?? lots[0]?.warehouseId ?? 'WH-MSA';
  return (
    <Modal
      size="md"
      title="New container loading plan"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            if (!si) return;
            const r = createLoadingPlan({ ref: sh ? `${sh.number} / ${si.number}` : si.number, shipmentId: sh?.id, siId: si.id, containerType: type, warehouseId: base, lotIds: lots.map((l) => l.id), reservedFor: si.number });
            if (r.ok && r.id) onMade(r.id);
          }}
        >
          Prepare plan
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Shipping instruction" span={2}>
          <select className="form-control" value={siId} onChange={(e) => setSiId(e.target.value)}>
            {sis.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} — {shp.party(s.customerId)?.name} · {s.destination}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Container type">
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as ContainerType)}>
            {(Object.keys(CONTAINER_SPEC) as ContainerType[]).map((c) => (
              <option key={c} value={c}>
                {CONTAINER_SPEC[c].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stuffing base">
          <input className="form-control" readOnly value={ops.state.warehouses.find((w) => w.id === base)?.name ?? base} />
        </Field>
      </div>
      <p className="sx-note">
        {lots.length} reserved lot(s), {num(lots.reduce((x, l) => x + l.reservedKg, 0))} kg. {sh ? `Linked to shipment ${sh.number}.` : 'Book the shipment from the instruction first so the container, seal and VGM flow onto it.'}
      </p>
    </Modal>
  );
};

const PlanDrawer: React.FC<{ p: LoadingPlan; onClose: () => void }> = ({ p, onClose }) => {
  const { state, actor, updatePlan, certifyVgm, stuffContainer } = useWarehouseExt();
  const docs = useDocCtx();
  const { readOnly } = useAccess();
  const [container, setContainer] = useState(p.container);
  const [seal, setSeal] = useState(p.seal);
  const [method, setMethod] = useState<'METHOD_1' | 'METHOD_2'>('METHOD_1');
  const [weigh, setWeigh] = useState<number | null>(null);
  const [scaleRef, setScaleRef] = useState('');
  const [sig, setSig] = useState<ESignature | null>(null);
  const [signing, setSigning] = useState(false);
  const spec = CONTAINER_SPEC[p.containerType];
  const cargo = planCargoKg(p.lines);
  const calc = vgmMethod2(p.lines, p.tareKg, p.dunnageKg);
  return (
    <Drawer wide title={`${p.number} — ${p.container || 'container to allocate'}`} subtitle={`${p.ref} · ${spec.label}`} badge={<Pill status={p.status === 'STUFFED' ? 'POSTED' : 'DRAFT'} label={p.status.toLowerCase()} />} onClose={onClose}>
      <DefList items={[['Cargo', `${num(cargo)} kg of ${num(spec.maxKg)} kg`], ['Bags', `${p.lines.reduce((x, l) => x + l.bags, 0)} of ${spec.maxBags}`], ['Tare + dunnage', `${num(p.tareKg)} + ${num(p.dunnageKg)} kg`], ['VGM (method 2)', `${num(calc)} kg`], ['Certified VGM', p.vgm ? `${p.vgm.number} · ${num(p.vgm.grossKg)} kg · ${p.vgm.weighedBy}` : '—']]} />
      <Meter value={cargo / spec.maxKg} tone={cargo / spec.maxKg > 0.98 ? 'red' : 'green'} />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Seq</th>
            <th>Lot</th>
            <th>Location</th>
            <th style={{ textAlign: 'right' }}>Bags</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => {
            const lot = state.lots.find((x) => x.id === l.lotId);
            return (
              <tr key={l.lotId}>
                <td>{l.seq}</td>
                <td>
                  <b className="sx-mono">{lot?.lotNo}</b> {lot?.garden} {lot?.grade}
                </td>
                <td>{locLabel(state.locations.find((x) => x.id === lot?.locationId))}</td>
                <td style={{ textAlign: 'right' }}>{l.bags}</td>
                <td style={{ textAlign: 'right' }}>{num(l.kg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sx-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => docs.print('loading', `Loading plan ${p.number}`, { plan: p, number: p.number })}>
          <Printer size={14} /> Loading plan
        </button>
        {p.vgm && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => docs.print('vgm', `VGM ${p.vgm?.number}`, { plan: p, number: p.vgm?.number })}>
            <Printer size={14} /> VGM certificate
          </button>
        )}
      </div>
      {p.status === 'DRAFT' && !readOnly && (
        <>
          <h4 className="sx-subhead">Container</h4>
          <div className="sx-inline-form">
            <input className="form-control" value={container} onChange={(e) => setContainer(e.target.value.toUpperCase())} placeholder="Container e.g. MSKU 1234567" aria-label="Container number" />
            <input className="form-control" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Seal number" aria-label="Seal number" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => updatePlan(p.id, { container, seal })}>
              <Container size={14} /> Save
            </button>
          </div>
          <h4 className="sx-subhead">Verified gross mass</h4>
          <div className="sx-inline-form">
            <select className="form-control" value={method} onChange={(e) => setMethod(e.target.value as 'METHOD_1' | 'METHOD_2')} aria-label="VGM method">
              <option value="METHOD_1">Method 1 — weigh the packed container</option>
              <option value="METHOD_2">Method 2 — cargo + packing + tare</option>
            </select>
            {method === 'METHOD_1' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setWeigh(Math.round(calc * (1 + (Math.random() - 0.5) * 0.01))), setScaleRef(`WB-${Date.now().toString().slice(-6)}`))}>
                <Scale size={14} /> Read weighbridge {weigh ? `(${num(weigh)} kg)` : ''}
              </button>
            )}
            <input className="form-control" value={scaleRef} onChange={(e) => setScaleRef(e.target.value)} placeholder="Weighbridge ticket / calc ref" aria-label="Scale reference" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSigning(true)}>
              <PenLine size={14} /> {sig ? 'Signed' : 'Sign'}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => certifyVgm(p.id, method, method === 'METHOD_1' ? weigh : null, scaleRef || (method === 'METHOD_2' ? `CALC-${p.number}` : ''), sig ?? undefined)}>
              Certify VGM
            </button>
          </div>
          {method === 'METHOD_1' && (
            <p className="sx-note">
              <SimBadge text="Weighbridge simulated" /> No weighbridge is connected; the reading is generated within ±0.5% of the declared mass.
            </p>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => stuffContainer(p.id)}>
            <Truck size={14} /> Stuff and seal container
          </button>
        </>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={p.history} />
      {signing && <SignModal signer={actor.name} meaning={`VGM for ${p.container || p.number}`} onClose={() => setSigning(false)} onSign={setSig} />}
    </Drawer>
  );
};

const PodModal: React.FC<{ deliveryId: string; onClose: () => void }> = ({ deliveryId, onClose }) => {
  const { recordPod } = useWarehouseExt();
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [signing, setSigning] = useState(false);
  return (
    <Modal size="md" title="Proof of delivery" subtitle="The receiver signs electronically" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" disabled={!receivedBy.trim()} onClick={() => setSigning(true)}>Sign and record</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Received by" required span={2}>
          <input className="form-control" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name of the person signing" />
        </Field>
        <Field label="Remarks" span={2}>
          <input className="form-control" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Condition of goods, shortages…" />
        </Field>
      </div>
      {signing && <SignModal signer={receivedBy} meaning="Goods received in good order" onClose={() => setSigning(false)} onSign={(s) => recordPod(deliveryId, receivedBy, s, remarks).ok && onClose()} />}
    </Modal>
  );
};
