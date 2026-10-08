import React, { useState } from 'react';
import { LayoutDashboard, Ship, FileCheck2, Anchor, ChevronRight, Receipt, Container, CheckCircle2, Circle, AlertTriangle, Globe2, CalendarClock } from 'lucide-react';
import { useOperations, type ShippingPage } from './store';
import { docsReady, shipBlockers, SHIP_LABEL, SHIP_STAGES, shipValue, stockAt } from './engine';
import { daysBetween, fmtDate, kes, round2, TODAY } from '../finance/engine';
import type { Shipment } from './types';
import { ApprovalPanel, DataTable, DefList, Drawer, FlowSteps, Hero, LinkButton, Meter, Panel, Pill, Stat, SuitePage, TodoList, greeting, type Column, type FlowAction, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useFocus, useTopOnChange } from './parts';
import { Ban, BarChart3, ClipboardList, FileText, Gauge, Plus, Radar, ScrollText, Shield, Truck, Wallet } from 'lucide-react';
import { useAccess } from '../../platform/access';
import { isShippingExt, SHP_EXT_LABEL, type ShippingExtPage } from './shipping/pages';
import { LogisticsFooter } from './warehousing/ui';
import { useShippingExt } from './shipping/store';
import { InstructionsPage } from './shipping/InstructionsPage';
import { BondsPage, ChargesPage, LicencesPage, TrackingPage, TrucksPage, VesselsPage } from './shipping/OpsPages';
import { TemplatesPage } from './shipping/TemplatesPage';
import { KpisPage, ShippingReportsPage } from './shipping/ReportsPage';

const LABEL: Record<ShippingPage, string> = { overview: 'Overview', shipments: 'Shipments', documents: 'Export documents', ...SHP_EXT_LABEL };
const S_PILL: Record<Shipment['stage'], string> = { BOOKED: 'DRAFT', DOCUMENTS: 'SUBMITTED', LOADED: 'APPROVED', DEPARTED: 'OPEN', ARRIVED: 'PART_PAID', DELIVERED: 'POSTED' };

const SOverview: React.FC = () => {
  const { state, actor, setShipping: go, commercial } = useOperations();
  const onWater = state.shipments.filter((s) => s.stage === 'DEPARTED');
  const open = state.shipments.filter((s) => s.stage !== 'DELIVERED');
  const docsMissing = open.reduce((x, s) => x + s.docs.filter((d) => !d.done).length, 0);
  const next = open.filter((s) => ['BOOKED', 'DOCUMENTS', 'LOADED'].includes(s.stage)).sort((a, b) => a.etd.localeCompare(b.etd))[0];
  const ytd = state.shipments.filter((s) => ['DEPARTED', 'ARRIVED', 'DELIVERED'].includes(s.stage) && s.etd.slice(0, 4) === TODAY.slice(0, 4));
  const todo: TodoItem[] = open.flatMap((s) => {
    const b = shipBlockers(s);
    const days = daysBetween(TODAY, s.etd);
    const out: TodoItem[] = [];
    if (['BOOKED', 'DOCUMENTS', 'LOADED'].includes(s.stage) && b.length)
      out.push({ id: s.id, tone: days <= 7 ? 'critical' : 'warning', icon: <FileCheck2 size={15} />, title: `${s.number}: ${b.length} item${b.length === 1 ? '' : 's'} before ${s.stage === 'LOADED' ? 'departure' : 'loading'}`, detail: `${b.slice(0, 2).join(', ')}${b.length > 2 ? '…' : ''} · sails in ${days} days`, onClick: () => go('shipments', s.id) });
    if (s.stage === 'DEPARTED' && s.eta <= TODAY) out.push({ id: `a${s.id}`, tone: 'info', icon: <Anchor size={15} />, title: `Confirm arrival of ${s.number}`, detail: `ETA was ${fmtDate(s.eta)}`, onClick: () => go('shipments', s.id) });
    if (!s.invoiceId && ['DOCUMENTS', 'LOADED'].includes(s.stage)) out.push({ id: `i${s.id}`, tone: 'info', icon: <Receipt size={15} />, title: `Raise export invoice for ${s.number}`, detail: `${kes(shipValue(s), { compact: true })} · ${commercial.party(s.customerId)?.name}`, onClick: () => go('shipments', s.id) });
    return out;
  });
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Shipping & exports"
        text={`${onWater.length} on the water · ${open.length} open shipments · ${docsMissing} documents outstanding`}
        actions={[
          { label: 'Shipments', icon: <Ship size={16} />, onClick: () => go('shipments') },
          { label: 'Document checklist', icon: <FileCheck2 size={16} />, onClick: () => go('documents') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="On the water" value={onWater.length} detail={kes(round2(onWater.reduce((x, s) => x + shipValue(s), 0)), { compact: true }) + ' of goods'} icon={<Ship size={17} />} onClick={() => go('shipments')} />
        <Stat label="Next sailing" value={next ? `${daysBetween(TODAY, next.etd)} days` : '—'} detail={next ? `${next.number} · ${next.vessel}` : 'Nothing booked'} icon={<CalendarClock size={17} />} tone="blue" onClick={() => next && go('shipments', next.id)} />
        <Stat label="Documents outstanding" value={docsMissing} detail="Across open shipments" icon={<FileCheck2 size={17} />} tone={docsMissing ? 'gold' : 'green'} onClick={() => go('documents')} />
        <Stat label="Exported this year" value={kes(round2(ytd.reduce((x, s) => x + shipValue(s), 0)), { compact: true })} detail={`${ytd.length} shipments`} icon={<Globe2 size={17} />} tone="violet" />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Documents, invoices and arrivals">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Shipment tracker" subtitle="Where each consignment is" action={<LinkButton onClick={() => go('shipments')}>All</LinkButton>}>
          <ul className="sx-tracker">
            {open.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => go('shipments', s.id)}>
                  <div>
                    <b>{s.number}</b>
                    <small>
                      {s.destination} · {s.vessel}
                    </small>
                  </div>
                  <div className="sx-track">
                    {SHIP_STAGES.map((st, i) => (
                      <i key={st} className={i <= SHIP_STAGES.indexOf(s.stage) ? 'on' : ''} title={SHIP_LABEL[st]} />
                    ))}
                  </div>
                  <span>{SHIP_LABEL[s.stage]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const ShipmentsPage: React.FC = () => {
  const { state, shipping, commercial, setShipping } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  useFocus(shipping.focus, (id) => state.shipments.some((s) => s.id === id), setOpenId);
  const columns: Column<Shipment>[] = [
    { key: 'n', header: 'Shipment', render: (s) => <b className="sx-mono">{s.number}</b>, sort: (s) => s.number, width: 130 },
    {
      key: 'c',
      header: 'Buyer and destination',
      render: (s) => (
        <div className="sx-cell-main">
          <span>{commercial.party(s.customerId)?.name}</span>
          <small>
            {s.incoterm} {s.destination}
          </small>
        </div>
      )
    },
    { key: 'v', header: 'Vessel', render: (s) => `${s.vessel}`, hideOnMobile: true },
    { key: 'e', header: 'ETD → ETA', render: (s) => `${fmtDate(s.etd).slice(0, 6)} → ${fmtDate(s.eta).slice(0, 6)}`, sort: (s) => s.etd },
    {
      key: 'd',
      header: 'Documents',
      render: (s) => (
        <div className="sx-meter-cell">
          <Meter value={docsReady(s)} tone={docsReady(s) < 1 && daysBetween(TODAY, s.etd) <= 7 && ['BOOKED', 'DOCUMENTS', 'LOADED'].includes(s.stage) ? 'red' : 'green'} />
          <small>
            {s.docs.filter((d) => d.done).length}/{s.docs.length}
          </small>
        </div>
      ),
      width: 150,
      hideOnMobile: true
    },
    { key: 'val', header: 'Value', render: (s) => kes(shipValue(s), { compact: true }), sort: shipValue, align: 'right' },
    { key: 's', header: 'Stage', render: (s) => <Pill status={S_PILL[s.stage]} label={SHIP_LABEL[s.stage]} />, sort: (s) => SHIP_STAGES.indexOf(s.stage) }
  ];
  const open = state.shipments.find((s) => s.id === openId);
  return (
    <SuitePage
      eyebrow="Exports"
      title="Shipments"
      subtitle="From booking to delivery. A shipment cannot sail until every export document is in, the invoice is raised and the VGM is certified."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShipping('instructions', 'new')}>
          <Plus size={15} /> New shipment (from an instruction)
        </button>
      }
    >
      <DataTable rows={state.shipments} columns={columns} rowKey={(s) => s.id} onRowClick={(s) => setOpenId(s.id)} selected={openId} initialSort={{ key: 'e', dir: 'desc' }} />
      {open && <ShipmentDrawer s={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const ShipmentDrawer: React.FC<{ s: Shipment; onClose: () => void }> = ({ s, onClose }) => {
  const { state, actor, products, commercial, finance, toggleDoc, setContainer, raiseExportInvoice, advanceShipment, blockShipment, setShipping } = useOperations();
  const shx = useShippingExt();
  const { readOnly } = useAccess();
  const [blockNote, setBlockNote] = useState('');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [container, setC] = useState(s.container ?? '');
  const [seal, setSeal] = useState(s.seal ?? '');
  const i = SHIP_STAGES.indexOf(s.stage);
  const nextStage = SHIP_STAGES[i + 1];
  const blockers = shipBlockers(s);
  const invoice = finance.state.documents.find((d) => d.id === s.invoiceId);
  const actions: FlowAction[] = [];
  if (!s.invoiceId && s.stage !== 'BOOKED') actions.push({ label: 'Raise export invoice in Finance', icon: <Receipt size={14} />, onClick: () => raiseExportInvoice(s.id), tone: 'secondary' });
  if (nextStage) actions.push({ label: `Mark ${SHIP_LABEL[nextStage].toLowerCase()}`, icon: <ChevronRight size={14} />, onClick: () => advanceShipment(s.id), disabled: blockers.length > 0, title: blockers.join(', ') });
  return (
    <Drawer wide title={s.number} subtitle={`${commercial.party(s.customerId)?.name} · ${s.incoterm} ${s.destination}`} badge={<Pill status={S_PILL[s.stage]} label={SHIP_LABEL[s.stage]} />} onClose={onClose}>
      <div className="sx-amount-hero">
        <div>
          <span>Consignment value</span>
          <strong>{kes(shipValue(s))}</strong>
        </div>
        <div>
          <span>{s.stage === 'DEPARTED' ? 'Arrives' : 'Sails'}</span>
          <b>{fmtDate(s.stage === 'DEPARTED' ? s.eta : s.etd)}</b>
        </div>
      </div>
      {blockers.length > 0 && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            <b>Before it can be {SHIP_LABEL[nextStage].toLowerCase()}</b>
            {blockers.map((b) => (
              <span key={b}>• {b}</span>
            ))}
          </div>
        </div>
      )}
      <DefList
        items={[
          ['Vessel', s.vessel],
          ['Shipping line', s.line],
          ['Booking', s.bookingRef],
          ['Container', s.container ?? '—'],
          ['Seal', s.seal ?? '—'],
          ['Export invoice', invoice ? `${invoice.number} (${invoice.status.toLowerCase()})` : s.invoiceNumber ?? '—'],
          ['Shipping instruction', s.siNumber ?? '—'],
          ['Stuffing base', s.stuffingBase ? (state.warehouses.find((w) => w.id === s.stuffingBase)?.name ?? s.stuffingBase) : 'Mombasa port store'],
          ['Loading plan', s.loadingPlan ?? '—'],
          ['VGM', s.vgm ? `${s.vgm.number} · ${s.vgm.grossKg.toLocaleString()} kg (${s.vgm.method === 'METHOD_1' ? 'method 1' : 'method 2'}) · ${s.vgm.by}` : 'Not certified'],
          ['Block', s.blocked ? `${s.blocked.reason} — ${s.blocked.by}` : 'None']
        ]}
      />
      {!readOnly && !['DEPARTED', 'ARRIVED', 'DELIVERED'].includes(s.stage) && (
        <div className="sx-inline-form">
          <input className="form-control" value={blockNote} onChange={(e) => setBlockNote(e.target.value)} placeholder="Reason to block (credit, quality, customer hold)" aria-label="Block reason" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => blockShipment(s.id, s.blocked ? null : blockNote).ok && setBlockNote('')}>
            <Ban size={14} /> {s.blocked ? 'Release block' : 'Block'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShipping('tracking', s.id)}>
            <Radar size={14} /> External tracking ({(shx.state.milestones[s.id] ?? []).filter((m) => m.status === 'APPROVED').length} done)
          </button>
        </div>
      )}
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Goods</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            {['BOOKED', 'DOCUMENTS'].includes(s.stage) && <th style={{ textAlign: 'right' }}>At port store</th>}
            <th style={{ textAlign: 'right' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, li) => {
            const have = stockAt(state, products, l.sku, 'WH-MSA');
            return (
              <tr key={`${l.sku}-${li}`}>
                <td>{l.description}</td>
                <td style={{ textAlign: 'right' }}>{l.qty}</td>
                {['BOOKED', 'DOCUMENTS'].includes(s.stage) && (
                  <td style={{ textAlign: 'right' }} className={s.siId ? 'sx-muted' : have < l.qty ? 'sx-danger-text' : 'sx-success-text'}>
                    {s.siId ? 'Reserved lots' : have}
                  </td>
                )}
                <td style={{ textAlign: 'right' }}>{(l.qty * l.price).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {['BOOKED', 'DOCUMENTS'].includes(s.stage) && (
        <div className="sx-inline-form">
          <input className="form-control" value={container} onChange={(e) => setC(e.target.value.toUpperCase())} placeholder="Container e.g. MSKU 1234567" />
          <input className="form-control" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Seal number" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setContainer(s.id, container, seal)}>
            <Container size={14} /> Save container
          </button>
        </div>
      )}
      <h4 className="sx-subhead">Export documents</h4>
      <ul className="sx-doclist">
        {s.docs.map((d) => (
          <li key={d.key} className={d.done ? 'done' : ''}>
            <button type="button" className="sx-check-icon" onClick={() => toggleDoc(s.id, d.key, refs[d.key] ?? '')} aria-label={d.done ? `Withdraw ${d.name}` : `Mark ${d.name} received`} disabled={d.key === 'invoice'}>
              {d.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            <div>
              <b>{d.name}</b>
              <small>
                {d.issuer}
                {d.ref && ` · ${d.ref}`}
              </small>
            </div>
            {!d.done && d.key !== 'invoice' && <input className="form-control" value={refs[d.key] ?? ''} onChange={(e) => setRefs({ ...refs, [d.key]: e.target.value })} placeholder="Reference no." />}
          </li>
        ))}
      </ul>
      <h4 className="sx-subhead">Progress</h4>
      <ApprovalPanel
        steps={<FlowSteps steps={SHIP_STAGES.map((x) => SHIP_LABEL[x])} at={s.stage === 'DELIVERED' ? 6 : i} />}
        actions={actions}
        actorLine={
          <>
            You are acting as <b>{actor.name}</b> ({actor.title}). Stores loads and seals containers.
          </>
        }
        history={s.history}
      />
    </Drawer>
  );
};

const DocumentsPage: React.FC = () => {
  const { state, setShipping } = useOperations();
  const open = state.shipments.filter((s) => s.stage !== 'DELIVERED');
  const keys = Array.from(new Map(open.flatMap((s) => s.docs.map((d) => [d.key, d.name] as [string, string]))).entries());
  return (
    <SuitePage eyebrow="Exports" title="Export documents" subtitle="Every document each open shipment needs, and what is still missing.">
      <div className="sx-table-wrap">
        <div className="sx-table-scroll">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Sails</th>
                {keys.map(([k, n]) => (
                  <th key={k} style={{ textAlign: 'center' }}>
                    {n.replace(' certificate', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setShipping('shipments', s.id)}>
                  <td>
                    <b className="sx-mono">{s.number}</b>
                  </td>
                  <td className={daysBetween(TODAY, s.etd) <= 7 && s.stage !== 'DEPARTED' ? 'sx-danger-text' : ''}>{fmtDate(s.etd)}</td>
                  {keys.map(([k]) => {
                    const d = s.docs.find((x) => x.key === k);
                    return (
                      <td key={k} style={{ textAlign: 'center' }}>
                        {!d ? <span className="sx-muted">n/a</span> : d.done ? <CheckCircle2 size={16} className="sx-success-text" /> : <Circle size={16} className="sx-muted" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SuitePage>
  );
};

export const ShippingSidebar: React.FC = () => {
  const { state, shipping, setShipping, actor } = useOperations();
  const { state: x } = useShippingExt();
  const portal = actor.role === 'CUSTOMER';
  const groups: SuiteNavGroup<ShippingPage>[] = [
    { label: 'Exports', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Ship',
      items: [
        { id: 'instructions', label: portal ? 'My instructions (portal)' : 'Shipping instructions', icon: ClipboardList, badge: x.instructions.filter((si) => (!portal || si.customerId === actor.customerId) && (si.status === 'SUBMITTED' || si.status === 'CREDIT_HOLD')).length },
        { id: 'shipments', label: 'Shipments', icon: Ship, badge: state.shipments.filter((s) => s.stage !== 'DELIVERED' && shipBlockers(s).length && daysBetween(TODAY, s.etd) <= 7).length, badgeTone: 'critical' },
        { id: 'documents', label: 'Export documents', icon: FileCheck2 },
        { id: 'tracking', label: 'External tracking', icon: Radar },
        { id: 'vessels', label: 'Vessel schedule', icon: CalendarClock },
        { id: 'trucks', label: 'Truck bookings', icon: Truck }
      ]
    },
    {
      label: 'Compliance & cost',
      items: [
        { id: 'bonds', label: 'Bonds', icon: Shield },
        { id: 'licences', label: 'Customs licences', icon: ScrollText },
        { id: 'charges', label: 'Charges & landed cost', icon: Wallet },
        { id: 'templates', label: 'Document templates', icon: FileText }
      ]
    },
    {
      label: 'Analyse',
      items: [
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'kpis', label: 'SI KPIs', icon: Gauge }
      ]
    }
  ];
  return <SuiteSidebar name="Shipping & Exports" tagline="Instruct · book · document · sail" icon={Ship} groups={groups} active={shipping.page} onSelect={(p) => setShipping(p)} footer={<LogisticsFooter />} />;
};
export const ShippingCrumb: React.FC = () => {
  const { shipping, setShipping } = useOperations();
  return <Crumb name="Shipping & Exports" page={shipping.page} label={LABEL[shipping.page]} onHome={() => setShipping('overview')} />;
};
export const ShippingSuite: React.FC = () => {
  const { shipping } = useOperations();
  useTopOnChange(shipping.page);
  return (
    <div className="sx-suite" key={shipping.page}>
      {shipping.page === 'overview' && <SOverview />}
      {shipping.page === 'shipments' && <ShipmentsPage />}
      {shipping.page === 'documents' && <DocumentsPage />}
      {isShippingExt(shipping.page) && <ShippingExt page={shipping.page} />}
    </div>
  );
};

const ShippingExt: React.FC<{ page: ShippingExtPage }> = ({ page }) => {
  switch (page) {
    case 'instructions':
      return <InstructionsPage />;
    case 'tracking':
      return <TrackingPage />;
    case 'vessels':
      return <VesselsPage />;
    case 'bonds':
      return <BondsPage />;
    case 'charges':
      return <ChargesPage />;
    case 'trucks':
      return <TrucksPage />;
    case 'licences':
      return <LicencesPage />;
    case 'templates':
      return <TemplatesPage />;
    case 'kpis':
      return <KpisPage />;
    default:
      return <ShippingReportsPage />;
  }
};
