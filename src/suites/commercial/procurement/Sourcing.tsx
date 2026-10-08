import React, { useEffect, useState } from 'react';
import { Award, Bell, CalendarClock, Copy, FileStack, Gavel, MessageSquare, Plus, Repeat, Send, Users, XCircle, Lock } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Attachments, ExportCsvButton, ImportCsvButton } from '../../../platform/Widgets';
import { DataTable, DefList, Drawer, Empty, Field, FlowSteps, Modal, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { auctionLive, bestBids, bidRank, BUSINESS_UNITS, EVENT_KIND_LABEL, EVENT_STATUS_LABEL, eventLines, latestResponses, optimiseAward, responseTotal, scoreResponse, SERVICE_TYPES, UNSPSC } from './ext/engine';
import { STANDARD_QUESTIONNAIRE } from './ext/data';
import { BidChart, FilterBar, NO_FILTERS, passes, ReadOnlyNote, Tabs, TONE, type Filters } from './ext/ui';
import type { EventDraft } from './ext/actions/sourcing';
import type { EventKind, EventLine, EventLot, EventResponse, QSection, QuestionType, SourcingEvent } from './ext/types';

const KINDS: EventKind[] = ['RFI', 'RFP', 'RFQ', 'REVERSE_AUCTION', 'AUCTION'];
const CATEGORIES = ['Packaging', 'Raw materials', 'Spares', 'Office', 'Services', 'Logistics', 'Tea'];
const uidL = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const localInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Estimated value of an event: requisition estimates or item costs. */
const useEventValue = () => {
  const { state } = useCommercial();
  return (e: SourcingEvent) =>
    round2(
      eventLines(e).reduce((s, l) => {
        const req = l.reqId ? state.requisitions.find((r) => r.id === l.reqId)?.lines.find((x) => x.id === l.reqLineId) : undefined;
        return s + l.qty * (req?.estPrice ?? state.products.find((p) => p.sku === l.sku)?.cost ?? 0);
      }, 0)
    );
};

/* ================================================================== */
/* Events list                                                         */
/* ================================================================== */

type EFilter = 'ALL' | 'DRAFT' | 'OPEN' | 'CLOSING' | 'EVALUATE' | 'AWARDED';

export const SourcingPage: React.FC = () => {
  const ext = useProcurementExt();
  const { finance } = useCommercial();
  const value = useEventValue();
  const [tab, setTab] = useState<'events' | 'templates'>('events');
  const [filter, setFilter] = useState<EFilter>('ALL');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SourcingEvent | 'new' | null>(null);
  const [fromReq, setFromReq] = useState(false);
  useEffect(() => {
    if (ext.page?.focus === 'new') setEditing('new');
    else if (ext.page?.focus) setOpenId(ext.page.focus);
  }, [ext.page]);
  const list = ext.state.events;
  const match = (e: SourcingEvent, x: EFilter) =>
    x === 'ALL' ||
    (x === 'DRAFT' && e.status === 'DRAFT') ||
    (x === 'OPEN' && e.status === 'OPEN') ||
    (x === 'CLOSING' && e.status === 'OPEN' && e.closes <= addDays(TODAY, 2)) ||
    (x === 'EVALUATE' && (e.status === 'CLOSED' || e.status === 'EVALUATION')) ||
    (x === 'AWARDED' && e.status === 'AWARDED');
  const rows = list
    .filter((e) => match(e, filter))
    .filter((e) => !q || `${e.number} ${e.title} ${e.category} ${e.businessUnit}`.toLowerCase().includes(q.toLowerCase()))
    .filter((e) => passes(f, { category: e.category, date: e.closes, value: value(e), supplier: f.supplier && e.invited.some((i) => i.supplierId === f.supplier) ? f.supplier : '' }));
  const count = (x: EFilter) => list.filter((e) => match(e, x)).length;
  const invitedAll = list.filter((e) => e.status !== 'DRAFT').reduce((s, e) => s + e.invited.length, 0);
  const respondedAll = list.filter((e) => e.status !== 'DRAFT').reduce((s, e) => s + new Set([...e.responses.map((r) => r.supplierId), ...e.bids.map((b) => b.supplierId)]).size, 0);
  const columns: Column<SourcingEvent>[] = [
    { key: 'n', header: 'Event', render: (e) => <b className="sx-mono">{e.number}</b>, sort: (e) => e.number, width: 130 },
    {
      key: 't',
      header: 'Title',
      render: (e) => (
        <div className="sx-cell-main">
          <span>{e.title}</span>
          <small>
            {EVENT_KIND_LABEL[e.kind]} · {e.category} · {e.businessUnit}
          </small>
        </div>
      ),
      sort: (e) => e.title
    },
    { key: 'c', header: 'Closes', render: (e) => (e.auction ? new Date(e.auction.end).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : fmtDate(e.closes)), sort: (e) => e.closes, hideOnMobile: true },
    { key: 'r', header: 'Responses', render: (e) => `${new Set([...e.responses.map((r) => r.supplierId), ...e.bids.map((b) => b.supplierId)]).size} / ${e.invited.length}`, align: 'right', hideOnMobile: true },
    { key: 'v', header: 'Estimate', render: (e) => kes(value(e), { compact: true }), sort: value, align: 'right' },
    { key: 's', header: 'Status', render: (e) => <Pill status={TONE[e.status]} label={auctionLive(e) ? 'Live auction' : EVENT_STATUS_LABEL[e.status]} />, sort: (e) => e.status }
  ];
  const current = list.find((e) => e.id === openId);
  return (
    <SuitePage
      eyebrow="Sourcing"
      title="Sourcing events"
      subtitle="RFIs, RFPs, RFQs and auctions: invite suppliers, compare responses, score them and award."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFromReq(true)}>
            <FileStack size={15} /> From requisitions
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <Plus size={15} /> New event
          </button>
        </>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Open now" value={count('OPEN')} detail={`${count('CLOSING')} closing within 2 days`} icon={<CalendarClock size={17} />} tone="blue" onClick={() => setFilter('OPEN')} />
        <Stat label="To evaluate" value={count('EVALUATE')} detail="Closed — score and award" icon={<Gavel size={17} />} tone="gold" onClick={() => setFilter('EVALUATE')} />
        <Stat label="Response rate" value={`${Math.round((respondedAll / Math.max(1, invitedAll)) * 100)}%`} detail={`${respondedAll} of ${invitedAll} invitations answered`} icon={<Users size={17} />} tone="violet" />
        <Stat label="Awarded" value={count('AWARDED')} detail={kes(round2(list.flatMap((e) => e.awards).reduce((s, a) => s + a.value, 0)), { compact: true })} icon={<Award size={17} />} onClick={() => setFilter('AWARDED')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['events', 'Events', list.length], ['templates', 'Templates', ext.state.rfxTemplates.length]]} />
      {tab === 'events' ? (
        <>
          <div className="sx-toolbar">
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={[
                ['ALL', 'All', count('ALL')],
                ['DRAFT', 'Draft', count('DRAFT')],
                ['OPEN', 'Open', count('OPEN')],
                ['CLOSING', 'Closing soon', count('CLOSING')],
                ['EVALUATE', 'Evaluate', count('EVALUATE')],
                ['AWARDED', 'Awarded', count('AWARDED')]
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search events…" />
          </div>
          <FilterBar value={f} onChange={setF} categories={CATEGORIES} suppliers={finance.state.parties.filter((p) => p.kind === 'SUPPLIER').map((p) => ({ id: p.id, name: p.name }))} />
          <div className="prx-inline">
            <ExportCsvButton
              name="sourcing-events"
              header={['Number', 'Title', 'Format', 'Category', 'Business unit', 'Status', 'Opens', 'Closes', 'Invited', 'Responses', 'Estimate', 'Awarded value']}
              rows={() => rows.map((e) => [e.number, e.title, EVENT_KIND_LABEL[e.kind], e.category, e.businessUnit, e.status, e.opens, e.closes, e.invited.length, latestResponses(e).length + bestBids(e).length, value(e), e.awards.reduce((s, a) => s + a.value, 0)])}
            />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => setOpenId(e.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty={<Empty icon={<Gavel size={20} />} title="No events here" />} />
        </>
      ) : (
        <DataTable
          rows={ext.state.rfxTemplates}
          rowKey={(t) => t.id}
          columns={[
            { key: 'n', header: 'Template', render: (t) => <b>{t.name}</b> },
            { key: 'k', header: 'Format', render: (t) => EVENT_KIND_LABEL[t.kind] },
            { key: 'c', header: 'Category', render: (t) => t.category },
            { key: 'l', header: 'Lines', render: (t) => t.lots.reduce((s, l) => s + l.lines.length, 0), align: 'right' },
            { key: 'q', header: 'Questions', render: (t) => t.questionnaire.reduce((s, x) => s + x.questions.length, 0), align: 'right' }
          ]}
        />
      )}
      {current && <EventDrawer e={current} onClose={() => setOpenId(null)} onEdit={() => setEditing(current)} onOpen={setOpenId} />}
      {editing && (
        <EventEditor
          e={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpenId(id);
          }}
        />
      )}
      {fromReq && (
        <FromRequisitions
          onClose={() => setFromReq(false)}
          onDone={(id) => {
            setFromReq(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const FromRequisitions: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const { state } = useCommercial();
  const ext = useProcurementExt();
  const open = state.requisitions.filter((r) => r.status === 'APPROVED' && !r.poId);
  const [pick, setPick] = useState<string[]>([]);
  const [kind, setKind] = useState<EventKind>('RFQ');
  return (
    <Modal
      size="md"
      title="Source approved requisitions"
      subtitle="Lines from the chosen requisitions become one event; the award orders against them."
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = ext.sourcing.eventFromRequisitions(pick, kind);
              if (r.ok && r.id) onDone(r.id);
            }}
          >
            Create event
          </button>
        </>
      }
    >
      <Field label="Format">
        <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {EVENT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {open.length === 0 ? (
        <Empty title="Nothing waiting to be sourced" text="Approved requisitions without a purchase order appear here." />
      ) : (
        <ul className="sx-list">
          {open.map((r) => (
            <li key={r.id}>
              <label className="prx-inline">
                <input type="checkbox" checked={pick.includes(r.id)} onChange={(e) => setPick(e.target.checked ? [...pick, r.id] : pick.filter((x) => x !== r.id))} />
                <span className="sx-mono">{r.number}</span>
                <span>{r.lines.map((l) => l.description).join(', ')}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

/* ================================================================== */
/* Event editor                                                        */
/* ================================================================== */

const blankLine = (): EventLine => ({ id: uidL('el'), description: '', qty: 1, uom: 'each' });

export const EventEditor: React.FC<{ e: SourcingEvent | null; onClose: () => void; onSaved: (id: string) => void }> = ({ e, onClose, onSaved }) => {
  const { state } = useCommercial();
  const ext = useProcurementExt();
  const [d, setD] = useState<EventDraft>(() =>
    e
      ? { title: e.title, kind: e.kind, category: e.category, businessUnit: e.businessUnit, opens: e.opens, closes: e.closes, qaDeadline: e.qaDeadline, lots: JSON.parse(JSON.stringify(e.lots)), questionnaire: JSON.parse(JSON.stringify(e.questionnaire)), priceWeight: e.priceWeight, terms: e.terms, templateId: e.templateId, auction: e.auction }
      : { title: '', kind: 'RFQ', category: 'Packaging', businessUnit: BUSINESS_UNITS[0], opens: TODAY, closes: addDays(TODAY, 7), lots: [{ id: uidL('lot'), name: 'Lot 1', lines: [blankLine()] }], questionnaire: [], priceWeight: 100, terms: 'Prices in KES exclusive of VAT, delivered to the factory store at Athi River.' }
  );
  const isAuction = d.kind === 'AUCTION' || d.kind === 'REVERSE_AUCTION';
  const items = state.products.filter((p) => p.kind === 'MATERIAL' || p.kind === 'SERVICE');
  const setLot = (id: string, patch: Partial<EventLot>) => setD({ ...d, lots: d.lots.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const setLine = (lotId: string, lineId: string, patch: Partial<EventLine>) => setLot(lotId, { lines: d.lots.find((l) => l.id === lotId)!.lines.map((x) => (x.id === lineId ? { ...x, ...patch } : x)) });
  const setSec = (id: string, patch: Partial<QSection>) => setD({ ...d, questionnaire: d.questionnaire.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const applyTemplate = (id: string) => {
    const t = ext.state.rfxTemplates.find((x) => x.id === id);
    if (!t) return;
    setD({ ...d, templateId: id, kind: t.kind, category: t.category, lots: JSON.parse(JSON.stringify(t.lots)), questionnaire: JSON.parse(JSON.stringify(t.questionnaire)), terms: t.terms, priceWeight: t.questionnaire.length ? 60 : 100 });
  };
  const save = () => {
    const draft: EventDraft = { ...d, auction: isAuction ? (d.auction ?? { start: new Date(Date.now() + 3_600_000).toISOString(), end: new Date(Date.now() + 7_200_000).toISOString(), extendMinutes: 3, extendWindowMinutes: 2, minDecrementPct: 1, showRank: 'RANK' }) : undefined };
    const r = e ? ext.sourcing.updateEvent(e.id, draft) : ext.sourcing.createEvent(draft);
    if (r.ok && r.id) onSaved(r.id);
  };
  const auc = d.auction ?? { start: new Date(Date.now() + 3_600_000).toISOString(), end: new Date(Date.now() + 7_200_000).toISOString(), extendMinutes: 3, extendWindowMinutes: 2, minDecrementPct: 1, showRank: 'RANK' as const };
  return (
    <Modal
      size="xl"
      title={e ? `Edit ${e.number}` : 'New sourcing event'}
      subtitle="Lots group the lines suppliers price together; the questionnaire is scored by the evaluation panel."
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save event
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Title" required span={2}>
          <input className="form-control" value={d.title} onChange={(x) => setD({ ...d, title: x.target.value })} placeholder="e.g. Corrugated cartons — Q3 supply" />
        </Field>
        <Field label="Format">
          <select className="form-control" value={d.kind} onChange={(x) => setD({ ...d, kind: x.target.value as EventKind })}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        {!e && (
          <Field label="Start from template">
            <select className="form-control" value={d.templateId ?? ''} onChange={(x) => applyTemplate(x.target.value)}>
              <option value="">Blank</option>
              {ext.state.rfxTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Category">
          <select className="form-control" value={d.category} onChange={(x) => setD({ ...d, category: x.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Business unit">
          <select className="form-control" value={d.businessUnit} onChange={(x) => setD({ ...d, businessUnit: x.target.value })}>
            {BUSINESS_UNITS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Opens">
          <input className="form-control" type="date" value={d.opens} onChange={(x) => setD({ ...d, opens: x.target.value })} />
        </Field>
        <Field label="Closes">
          <input className="form-control" type="date" value={d.closes} onChange={(x) => setD({ ...d, closes: x.target.value })} />
        </Field>
        <Field label="Questions deadline">
          <input className="form-control" type="date" value={d.qaDeadline ?? ''} onChange={(x) => setD({ ...d, qaDeadline: x.target.value || undefined })} />
        </Field>
        <Field label="Price weight %" hint="The rest is the questionnaire score">
          <input className="form-control" type="number" min="0" max="100" value={d.priceWeight} onChange={(x) => setD({ ...d, priceWeight: Number(x.target.value) })} />
        </Field>
        <Field label="Terms" span={2}>
          <input className="form-control" value={d.terms} onChange={(x) => setD({ ...d, terms: x.target.value })} />
        </Field>
      </div>
      {isAuction && (
        <>
          <h4 className="sx-subhead">Auction rules</h4>
          <div className="sx-grid">
            <Field label="Bidding starts">
              <input className="form-control" type="datetime-local" value={localInput(auc.start)} onChange={(x) => setD({ ...d, auction: { ...auc, start: new Date(x.target.value).toISOString() } })} />
            </Field>
            <Field label="Bidding ends">
              <input className="form-control" type="datetime-local" value={localInput(auc.end)} onChange={(x) => setD({ ...d, auction: { ...auc, end: new Date(x.target.value).toISOString() } })} />
            </Field>
            <Field label="Extend by (min)" hint="When a bid lands in the closing window">
              <input className="form-control" type="number" min="0" value={auc.extendMinutes} onChange={(x) => setD({ ...d, auction: { ...auc, extendMinutes: Number(x.target.value) } })} />
            </Field>
            <Field label="Closing window (min)">
              <input className="form-control" type="number" min="0" value={auc.extendWindowMinutes} onChange={(x) => setD({ ...d, auction: { ...auc, extendWindowMinutes: Number(x.target.value) } })} />
            </Field>
            <Field label="Minimum improvement %">
              <input className="form-control" type="number" min="0" step="0.5" value={auc.minDecrementPct} onChange={(x) => setD({ ...d, auction: { ...auc, minDecrementPct: Number(x.target.value) } })} />
            </Field>
            <Field label="Suppliers see">
              <select className="form-control" value={auc.showRank} onChange={(x) => setD({ ...d, auction: { ...auc, showRank: x.target.value as 'NONE' | 'RANK' | 'BEST_PRICE' } })}>
                <option value="NONE">Nothing (sealed)</option>
                <option value="RANK">Their rank</option>
                <option value="BEST_PRICE">The best price</option>
              </select>
            </Field>
            <Field label="Ceiling price">
              <input className="form-control" type="number" min="0" value={auc.reservePrice ?? ''} onChange={(x) => setD({ ...d, auction: { ...auc, reservePrice: Number(x.target.value) || undefined } })} />
            </Field>
          </div>
        </>
      )}
      <h4 className="sx-subhead">Lots and lines</h4>
      {d.lots.map((lot) => (
        <div key={lot.id} className="sx-panel" style={{ padding: 10, marginBottom: 10 }}>
          <div className="prx-inline">
            <input className="form-control" value={lot.name} onChange={(x) => setLot(lot.id, { name: x.target.value })} aria-label="Lot name" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, lots: d.lots.filter((l) => l.id !== lot.id) })} disabled={d.lots.length === 1}>
              Remove lot
            </button>
          </div>
          <table className="sx-mini-table sx-alloc">
            <thead>
              <tr>
                <th>Item / service</th>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 90 }}>Unit</th>
                <th>Specification / UNSPSC</th>
              </tr>
            </thead>
            <tbody>
              {lot.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    <select
                      className="form-control"
                      value={l.sku ?? (l.serviceType ? `svc:${l.serviceType}` : '')}
                      onChange={(x) => {
                        const v = x.target.value;
                        const p = items.find((i) => i.sku === v);
                        if (p) setLine(lot.id, l.id, { sku: p.sku, description: p.name, uom: p.unit, serviceType: undefined });
                        else if (v.startsWith('svc:')) setLine(lot.id, l.id, { sku: undefined, serviceType: v.slice(4), uom: 'jobs', description: l.description || v.slice(4) });
                        else setLine(lot.id, l.id, { sku: undefined, serviceType: undefined });
                      }}
                    >
                      <option value="">Free text</option>
                      <optgroup label="Catalogue">
                        {items.map((p) => (
                          <option key={p.sku} value={p.sku}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Services">
                        {SERVICE_TYPES.map((s) => (
                          <option key={s} value={`svc:${s}`}>
                            {s}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td>
                    <input className="form-control" value={l.description} onChange={(x) => setLine(lot.id, l.id, { description: x.target.value })} />
                  </td>
                  <td>
                    <input className="form-control" type="number" min="0" value={l.qty} onChange={(x) => setLine(lot.id, l.id, { qty: Number(x.target.value) })} />
                  </td>
                  <td>
                    <input className="form-control" value={l.uom} onChange={(x) => setLine(lot.id, l.id, { uom: x.target.value })} />
                  </td>
                  <td>
                    <input className="form-control" list="prx-unspsc" value={l.spec ?? ''} onChange={(x) => setLine(lot.id, l.id, { spec: x.target.value })} placeholder="e.g. 5-ply, 400×300×300 mm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLot(lot.id, { lines: [...lot.lines, blankLine()] })}>
            <Plus size={14} /> Add line
          </button>
        </div>
      ))}
      <datalist id="prx-unspsc">
        {UNSPSC.map(({ code, label: name }) => (
          <option key={code} value={`${code} ${name}`} />
        ))}
      </datalist>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setD({ ...d, lots: [...d.lots, { id: uidL('lot'), name: `Lot ${d.lots.length + 1}`, lines: [blankLine()] }] })}>
        <Plus size={14} /> Add lot
      </button>
      {!isAuction && (
        <>
          <h4 className="sx-subhead">Questionnaire</h4>
          <div className="prx-inline">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setD({ ...d, questionnaire: JSON.parse(JSON.stringify(STANDARD_QUESTIONNAIRE)), priceWeight: d.priceWeight === 100 ? 60 : d.priceWeight })}>
              Use the standard supplier questionnaire
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, questionnaire: [...d.questionnaire, { id: uidL('s'), name: 'New section', weight: 0, questions: [] }] })}>
              <Plus size={14} /> Add section
            </button>
            <span className="sx-muted">Section weights: {d.questionnaire.reduce((s, x) => s + x.weight, 0)} / 100</span>
          </div>
          {d.questionnaire.map((sec) => (
            <div key={sec.id} className="sx-panel" style={{ padding: 10, marginBottom: 8 }}>
              <div className="prx-inline">
                <input className="form-control" value={sec.name} onChange={(x) => setSec(sec.id, { name: x.target.value })} aria-label="Section name" />
                <input className="form-control" type="number" min="0" max="100" value={sec.weight} onChange={(x) => setSec(sec.id, { weight: Number(x.target.value) })} aria-label="Section weight" style={{ maxWidth: 90 }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSec(sec.id, { questions: [...sec.questions, { id: uidL('q'), text: '', type: 'SCORE', weight: 1, required: true }] })}>
                  <Plus size={14} /> Question
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, questionnaire: d.questionnaire.filter((s) => s.id !== sec.id) })}>
                  Remove
                </button>
              </div>
              {sec.questions.map((qn) => (
                <div key={qn.id} className="prx-inline">
                  <input className="form-control" value={qn.text} onChange={(x) => setSec(sec.id, { questions: sec.questions.map((y) => (y.id === qn.id ? { ...y, text: x.target.value } : y)) })} placeholder="Question" style={{ flex: '3 1 260px' }} />
                  <select className="form-control" value={qn.type} onChange={(x) => setSec(sec.id, { questions: sec.questions.map((y) => (y.id === qn.id ? { ...y, type: x.target.value as QuestionType } : y)) })} aria-label="Answer type">
                    <option value="SCORE">Scored 0–5</option>
                    <option value="YESNO">Yes / no</option>
                    <option value="TEXT">Text</option>
                    <option value="NUMBER">Number</option>
                  </select>
                  <input className="form-control" type="number" min="0" value={qn.weight} onChange={(x) => setSec(sec.id, { questions: sec.questions.map((y) => (y.id === qn.id ? { ...y, weight: Number(x.target.value) } : y)) })} aria-label="Question weight" style={{ maxWidth: 80 }} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
};

/* ================================================================== */
/* Response form (buyer on behalf, or supplier portal)                  */
/* ================================================================== */

export const ResponseForm: React.FC<{ e: SourcingEvent; supplierId: string; onBehalf: boolean; by: string; onClose: () => void }> = ({ e, supplierId, onBehalf, by, onClose }) => {
  const ext = useProcurementExt();
  const { party } = useCommercial();
  const prev = latestResponses(e, true).find((r) => r.supplierId === supplierId);
  const [prices, setPrices] = useState<Record<string, number>>(prev?.prices ?? {});
  const [leadDays, setLead] = useState(prev?.leadDays ?? 7);
  const [costs, setCosts] = useState(prev?.costs ?? { freight: 0, duty: 0, other: 0 });
  const [answers, setAnswers] = useState<Record<string, string>>(prev?.answers ?? {});
  const [bundle, setBundle] = useState(prev?.bundleDiscountPct ?? 0);
  const [tiers, setTiers] = useState<NonNullable<EventResponse['tiers']>>(prev?.tiers ?? []);
  const [notes, setNotes] = useState(prev?.notes ?? '');
  const draft = { id: 'x', supplierId, revision: 0, submittedAt: '', submittedBy: by, onBehalf, prices, leadDays, costs, answers, bundleDiscountPct: bundle || undefined, tiers, notes, valid: true } as EventResponse;
  return (
    <Modal
      size="xl"
      title={`${prev ? 'Revise' : 'Submit'} response — ${e.number}`}
      subtitle={`${party(supplierId)?.name}${onBehalf ? ' · keyed by the buyer on the supplier’s behalf' : ''}${prev ? ` · revision ${prev.revision + 1}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Total cost <b>{kes(responseTotal(e, draft))}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.submitResponse(e.id, { supplierId, onBehalf, prices, leadDays, costs, answers, bundleDiscountPct: bundle || undefined, tiers, notes }, by).ok && onClose()}>
            <Send size={14} /> Submit response
          </button>
        </>
      }
    >
      {e.kind !== 'RFI' &&
        e.lots.map((lot) => (
          <div key={lot.id}>
            <h4 className="sx-subhead">{lot.name}</h4>
            <table className="sx-mini-table sx-alloc">
              <thead>
                <tr>
                  <th>Line</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ width: 150 }}>Unit price (KES)</th>
                </tr>
              </thead>
              <tbody>
                {lot.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.description}
                      {l.spec && <small className="sx-muted sx-block">{l.spec}</small>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.qty} {l.uom}
                    </td>
                    <td>
                      <input className="form-control" type="number" min="0" value={prices[l.id] || ''} onChange={(x) => setPrices({ ...prices, [l.id]: Number(x.target.value) })} aria-label={`Price for ${l.description}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      <div className="sx-grid">
        <Field label="Lead time (days)">
          <input className="form-control" type="number" min="0" value={leadDays} onChange={(x) => setLead(Number(x.target.value))} />
        </Field>
        <Field label="Freight">
          <input className="form-control" type="number" min="0" value={costs.freight || ''} onChange={(x) => setCosts({ ...costs, freight: Number(x.target.value) })} />
        </Field>
        <Field label="Duty">
          <input className="form-control" type="number" min="0" value={costs.duty || ''} onChange={(x) => setCosts({ ...costs, duty: Number(x.target.value) })} />
        </Field>
        <Field label="Other costs">
          <input className="form-control" type="number" min="0" value={costs.other || ''} onChange={(x) => setCosts({ ...costs, other: Number(x.target.value) })} />
        </Field>
        <Field label="Bundle discount %" hint="Off a lot if all its lines are won together">
          <input className="form-control" type="number" min="0" max="50" value={bundle || ''} onChange={(x) => setBundle(Number(x.target.value))} />
        </Field>
        <Field label="Notes" span={3}>
          <input className="form-control" value={notes} onChange={(x) => setNotes(x.target.value)} />
        </Field>
      </div>
      {e.kind !== 'RFI' && (
        <>
          <h4 className="sx-subhead">Volume discounts</h4>
          {tiers.map((t, i) => (
            <div key={i} className="prx-inline">
              <select className="form-control" value={t.lineId} onChange={(x) => setTiers(tiers.map((y, j) => (j === i ? { ...y, lineId: x.target.value } : y)))} aria-label="Line">
                {eventLines(e).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.description}
                  </option>
                ))}
              </select>
              <input className="form-control" type="number" min="0" value={t.minQty} onChange={(x) => setTiers(tiers.map((y, j) => (j === i ? { ...y, minQty: Number(x.target.value) } : y)))} aria-label="From quantity" />
              <input className="form-control" type="number" min="0" max="50" value={t.pct} onChange={(x) => setTiers(tiers.map((y, j) => (j === i ? { ...y, pct: Number(x.target.value) } : y)))} aria-label="Discount %" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTiers([...tiers, { lineId: eventLines(e)[0]?.id ?? '', minQty: 0, pct: 0 }])}>
            <Plus size={14} /> Add volume discount
          </button>
        </>
      )}
      {e.questionnaire.map((sec) => (
        <div key={sec.id}>
          <h4 className="sx-subhead">
            {sec.name} <span className="sx-muted">({sec.weight}%)</span>
          </h4>
          {sec.questions.map((qn) => (
            <Field key={qn.id} label={qn.text} required={qn.required} span={4}>
              {qn.type === 'YESNO' ? (
                <select className="form-control" value={answers[qn.id] ?? ''} onChange={(x) => setAnswers({ ...answers, [qn.id]: x.target.value })}>
                  <option value="">Choose…</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              ) : (
                <input className="form-control" type={qn.type === 'NUMBER' ? 'number' : 'text'} value={answers[qn.id] ?? ''} onChange={(x) => setAnswers({ ...answers, [qn.id]: x.target.value })} />
              )}
            </Field>
          ))}
        </div>
      ))}
    </Modal>
  );
};

/* ================================================================== */
/* Event drawer                                                        */
/* ================================================================== */

type DTab = 'overview' | 'lines' | 'suppliers' | 'responses' | 'evaluation' | 'auction' | 'messages' | 'award' | 'files';

export const EventDrawer: React.FC<{ e: SourcingEvent; onClose: () => void; onEdit: () => void; onOpen: (id: string) => void }> = ({ e, onClose, onEdit, onOpen }) => {
  const ext = useProcurementExt();
  const { party, actor, finance } = useCommercial();
  const value = useEventValue();
  const [tab, setTab] = useState<DTab>('overview');
  const [responding, setResponding] = useState<string | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [pub, setPub] = useState(true);
  const [panel, setPanel] = useState<string[]>([actor.name]);
  const [bid, setBid] = useState({ supplierId: '', amount: 0 });
  const [convertTo, setConvertTo] = useState<EventKind | ''>('');
  const [cancelReason, setCancelReason] = useState('');
  const [tplName, setTplName] = useState('');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!e.auction || e.status !== 'OPEN') return;
    const t = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [e.auction, e.status]);
  const name = (id: string) => party(id)?.name ?? ext.state.suppliers.find((p) => p.partyId === id)?.name ?? id;
  const latest = latestResponses(e, true);
  const lines = eventLines(e);
  const suppliers = finance.state.parties.filter((p) => p.kind === 'SUPPLIER' && !e.invited.some((i) => i.supplierId === p.id));
  const approved = (id: string) => ext.state.suppliers.find((p) => p.partyId === id)?.status ?? 'APPROVED';
  const stepAt = { DRAFT: 0, OPEN: 1, CLOSED: 2, EVALUATION: 3, AWARDED: 5, CANCELLED: 0 }[e.status];
  const tabs: [DTab, string, number?][] = [
    ['overview', 'Overview'],
    ['lines', 'Lines', lines.length],
    ['suppliers', 'Suppliers', e.invited.length],
    ...(e.auction ? ([['auction', 'Live auction', e.bids.length]] as [DTab, string, number][]) : ([['responses', 'Responses', latest.length]] as [DTab, string, number][])),
    ...(e.questionnaire.length ? ([['evaluation', 'Evaluation', e.evaluations.length]] as [DTab, string, number][]) : []),
    ['messages', 'Messages', e.messages.length],
    ['award', 'Award'],
    ['files', 'Files']
  ];
  return (
    <>
      <Drawer
        wide
        title={`${e.number} · ${e.title}`}
        subtitle={`${EVENT_KIND_LABEL[e.kind]} · ${e.category} · ${e.businessUnit} · owner ${e.owner}`}
        badge={<Pill status={TONE[e.status]} label={auctionLive(e) ? 'Live auction' : EVENT_STATUS_LABEL[e.status]} />}
        onClose={onClose}
        footer={
          <div className="prx-inline">
            {e.status === 'DRAFT' && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                  Edit
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.publish(e.id)}>
                  <Send size={14} /> Publish
                </button>
              </>
            )}
            {e.status === 'OPEN' && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.sourcing.remind(e.id)}>
                  <Bell size={14} /> Remind non-responders
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.close(e.id)}>
                  <Lock size={14} /> Close
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const r = ext.sourcing.copyEvent(e.id);
                if (r.ok && r.id) onOpen(r.id);
              }}
            >
              <Copy size={14} /> Copy
            </button>
          </div>
        }
      >
        <FlowSteps steps={['Draft', 'Open', 'Closed', 'Evaluation', 'Awarded']} at={stepAt} off={e.status === 'CANCELLED'} />
        <Tabs value={tab} onChange={setTab} tabs={tabs} />

        {tab === 'overview' && (
          <>
            <DefList
              items={[
                ['Opens', fmtDate(e.opens)],
                ['Closes', e.auction ? new Date(e.auction.end).toLocaleString('en-GB') : fmtDate(e.closes)],
                ['Questions until', e.qaDeadline ? fmtDate(e.qaDeadline) : '—'],
                ['Estimated value', kes(value(e))],
                ['Price weight', `${e.priceWeight}%`],
                ['Converted', e.convertedFrom ? `from ${ext.state.events.find((x) => x.id === e.convertedFrom)?.number}` : e.convertedTo ? `to ${ext.state.events.find((x) => x.id === e.convertedTo)?.number}` : '—']
              ]}
            />
            <p className="sx-note">{e.terms}</p>
            <h4 className="sx-subhead">What suppliers see</h4>
            <div className="sx-callout info">
              <Users size={16} />
              <div>
                <b>
                  {EVENT_KIND_LABEL[e.kind]}: {e.title}
                </b>
                <span>
                  {lines.length} line(s) in {e.lots.length} lot(s) · {e.questionnaire.reduce((s, x) => s + x.questions.length, 0)} questions · respond by {e.auction ? new Date(e.auction.end).toLocaleString('en-GB') : fmtDate(e.closes)}
                </span>
              </div>
            </div>
            {e.status !== 'AWARDED' && e.status !== 'CANCELLED' && (
              <>
                <h4 className="sx-subhead">Change format</h4>
                <div className="prx-inline">
                  <select className="form-control" value={convertTo} onChange={(x) => setConvertTo(x.target.value as EventKind)} aria-label="Convert to">
                    <option value="">Convert to…</option>
                    {KINDS.filter((k) => k !== e.kind).map((k) => (
                      <option key={k} value={k}>
                        {EVENT_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!convertTo}
                    onClick={() => {
                      const r = ext.sourcing.convert(e.id, convertTo as EventKind);
                      if (r.ok && r.id) onOpen(r.id);
                    }}
                  >
                    <Repeat size={14} /> Convert
                  </button>
                </div>
                <div className="prx-inline">
                  <input className="form-control" value={cancelReason} onChange={(x) => setCancelReason(x.target.value)} placeholder="Reason for cancelling" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.sourcing.cancel(e.id, cancelReason)}>
                    <XCircle size={14} /> Cancel event
                  </button>
                </div>
              </>
            )}
            <div className="prx-inline">
              <input className="form-control" value={tplName} onChange={(x) => setTplName(x.target.value)} placeholder="Template name" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.sourcing.saveAsTemplate(e.id, tplName).ok && setTplName('')}>
                Save as template
              </button>
            </div>
            <h4 className="sx-subhead">History</h4>
            <Timeline items={e.history} />
          </>
        )}

        {tab === 'lines' && (
          <>
            {e.status === 'DRAFT' && (
              <div className="prx-inline">
                <ImportCsvButton label="Import lines" template={['lot', 'sku', 'description', 'qty', 'uom', 'spec']} onImport={(rows) => ext.sourcing.importLines(e.id, rows)} />
              </div>
            )}
            {e.lots.map((lot) => (
              <div key={lot.id}>
                <h4 className="sx-subhead">{lot.name}</h4>
                <table className="sx-mini-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Specification</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th>From</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.description}
                          {l.serviceType && <span className="sx-tag">Service · {l.serviceType}</span>}
                        </td>
                        <td>{l.spec ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {l.qty} {l.uom}
                        </td>
                        <td>{l.reqId ? <span className="sx-mono">{ext.ctx.com.state.requisitions.find((r) => r.id === l.reqId)?.number}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {tab === 'suppliers' && (
          <>
            {(e.status === 'DRAFT' || e.status === 'OPEN') && (
              <div className="prx-inline">
                <select className="form-control" multiple value={inviteIds} onChange={(x) => setInviteIds(Array.from(x.target.selectedOptions).map((o) => o.value))} aria-label="Suppliers to invite" style={{ minHeight: 90 }}>
                  {suppliers.map((p) => (
                    <option key={p.id} value={p.id} disabled={approved(p.id) !== 'APPROVED'}>
                      {p.name} · {p.category}
                      {approved(p.id) !== 'APPROVED' ? ` (${approved(p.id).toLowerCase()})` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.invite(e.id, inviteIds).ok && setInviteIds([])}>
                  <Users size={14} /> Invite
                </button>
                {e.status === 'DRAFT' && ext.state.events.some((x) => x.id !== e.id && x.category === e.category && x.invited.length) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const prev = ext.state.events.find((x) => x.id !== e.id && x.category === e.category && x.invited.length)!;
                      ext.sourcing.invite(
                        e.id,
                        prev.invited.map((i) => i.supplierId).filter((id) => approved(id) === 'APPROVED')
                      );
                    }}
                  >
                    Copy invitations from the last {e.category} event
                  </button>
                )}
              </div>
            )}
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Invited</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {e.invited.map((i) => {
                  const r = latest.find((x) => x.supplierId === i.supplierId);
                  const bids = e.bids.filter((b) => b.supplierId === i.supplierId).length;
                  return (
                    <tr key={i.supplierId}>
                      <td>{name(i.supplierId)}</td>
                      <td>
                        {i.at.slice(0, 10)} · {i.by}
                      </td>
                      <td>{r ? (r.valid ? `Responded (rev ${r.revision})` : `Invalid: ${r.invalidReason}`) : bids ? `${bids} bids` : i.reminded ? `Reminded ×${i.reminded}` : 'Waiting'}</td>
                      <td>
                        {e.status === 'DRAFT' && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => ext.sourcing.uninvite(e.id, i.supplierId)}>
                            Remove
                          </button>
                        )}
                        {e.status === 'OPEN' && !e.auction && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setResponding(i.supplierId)}>
                            Enter response on behalf
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {tab === 'responses' && (
          <>
            <div className="prx-inline">
              <ExportCsvButton
                name={`${e.number}-responses`}
                header={['Supplier', 'Revision', 'Submitted', 'By', 'On behalf', 'Valid', ...lines.map((l) => l.description), 'Freight', 'Duty', 'Other', 'Lead days', 'Total cost']}
                rows={() => e.responses.map((r) => [name(r.supplierId), r.revision, r.submittedAt, r.submittedBy, r.onBehalf ? 'Yes' : 'No', r.valid ? 'Yes' : `No — ${r.invalidReason}`, ...lines.map((l) => r.prices[l.id] ?? ''), r.costs.freight, r.costs.duty, r.costs.other, r.leadDays, responseTotal(e, r)])}
              />
            </div>
            {latest.length === 0 ? (
              <Empty title="No responses yet" text={e.status === 'OPEN' ? 'Suppliers respond on the portal; a buyer can key one on their behalf from the Suppliers tab.' : undefined} />
            ) : (
              <table className="sx-mini-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    {latest.map((r) => (
                      <th key={r.supplierId} style={{ textAlign: 'right' }}>
                        {name(r.supplierId).split(' ')[0]}
                        {!r.valid && ' ✕'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const low = Math.min(...latest.filter((r) => r.valid && (r.prices[l.id] ?? 0) > 0).map((r) => r.prices[l.id]));
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.description} <small className="sx-muted">× {l.qty}</small>
                        </td>
                        {latest.map((r) => (
                          <td key={r.supplierId} style={{ textAlign: 'right' }} className={r.prices[l.id] === low ? 'sx-success-text' : ''}>
                            {r.prices[l.id] ? r.prices[l.id].toLocaleString() : '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr>
                    <td>Freight + duty + other</td>
                    {latest.map((r) => (
                      <td key={r.supplierId} style={{ textAlign: 'right' }}>
                        {(r.costs.freight + r.costs.duty + r.costs.other).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>
                      <b>Total cost of ownership</b>
                    </td>
                    {latest.map((r) => (
                      <td key={r.supplierId} style={{ textAlign: 'right' }}>
                        <b>{responseTotal(e, r).toLocaleString()}</b>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Lead time</td>
                    {latest.map((r) => (
                      <td key={r.supplierId} style={{ textAlign: 'right' }}>
                        {r.leadDays} days
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
            <ul className="sx-list">
              {latest.map((r) => (
                <li key={r.id}>
                  <span>{name(r.supplierId)}</span>
                  <span className="sx-muted">
                    rev {r.revision} · {r.submittedAt.slice(0, 16).replace('T', ' ')} · {r.onBehalf ? `keyed by ${r.submittedBy}` : 'portal'}
                    {r.bundleDiscountPct ? ` · ${r.bundleDiscountPct}% bundle` : ''}
                    {r.tiers?.length ? ` · ${r.tiers.length} volume tier(s)` : ''}
                  </span>
                  {r.valid ? (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => ext.sourcing.disqualify(e.id, r.id, window.prompt('Why is this bid invalid?') ?? '')}>
                      Mark invalid
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => ext.sourcing.reinstate(e.id, r.supplierId)}>
                      Reinstate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === 'evaluation' && (
          <>
            {e.status === 'CLOSED' && (
              <div className="prx-inline">
                <select className="form-control" multiple value={panel} onChange={(x) => setPanel(Array.from(x.target.selectedOptions).map((o) => o.value))} aria-label="Evaluation panel">
                  {['Peter Mwangi', 'Lucy Njeri', 'Amina Hassan'].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.startEvaluation(e.id, panel)}>
                  Start evaluation
                </button>
              </div>
            )}
            <p className="sx-muted">
              Panel: {e.panel.join(', ')} · price {e.priceWeight}% / questionnaire {100 - e.priceWeight}% · only panel members can score
            </p>
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  {e.questionnaire.map((s) => (
                    <th key={s.id} style={{ textAlign: 'right' }}>
                      {s.name} ({s.weight}%)
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Technical</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>Weighted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {latestResponses(e)
                  .map((r) => ({ r, sc: scoreResponse(e, r.supplierId) }))
                  .sort((a, b) => b.sc.total - a.sc.total)
                  .map(({ r, sc }) => (
                    <tr key={r.supplierId}>
                      <td>
                        {name(r.supplierId)}
                        <small className="sx-muted sx-block">{sc.evaluators} evaluator(s)</small>
                      </td>
                      {e.questionnaire.map((s) => (
                        <td key={s.id} style={{ textAlign: 'right' }}>
                          {sc.bySection[s.id] ?? 0}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}>{sc.technical}</td>
                      <td style={{ textAlign: 'right' }}>{sc.price}</td>
                      <td style={{ textAlign: 'right' }}>
                        <b>{sc.total}</b>
                      </td>
                      <td>
                        {e.status === 'EVALUATION' && (
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setScoring(r.supplierId)}>
                            Score
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        {tab === 'auction' && e.auction && (
          <>
            <DefList
              items={[
                ['Bidding', `${new Date(e.auction.start).toLocaleString('en-GB')} → ${new Date(e.auction.end).toLocaleString('en-GB')}`],
                ['Status', auctionLive(e) ? 'Live now' : Date.now() < new Date(e.auction.start).getTime() ? 'Not started' : 'Ended'],
                ['Auto-extension', `${e.auction.extendMinutes} min when a bid lands in the last ${e.auction.extendWindowMinutes} min · extended ${e.auction.extensions}×`],
                ['Minimum improvement', `${e.auction.minDecrementPct}%`],
                ['Suppliers see', e.auction.showRank === 'NONE' ? 'Nothing' : e.auction.showRank === 'RANK' ? 'Their rank' : 'Best price'],
                ['Ceiling', e.auction.reservePrice ? kes(e.auction.reservePrice) : '—']
              ]}
            />
            <BidChart e={e} name={name} />
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Best bid</th>
                  <th style={{ textAlign: 'right' }}>Bids</th>
                </tr>
              </thead>
              <tbody>
                {bestBids(e).map((b) => (
                  <tr key={b.supplierId}>
                    <td>{bidRank(e, b.supplierId)}</td>
                    <td>{name(b.supplierId)}</td>
                    <td style={{ textAlign: 'right' }}>{b.amount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{e.bids.filter((x) => x.supplierId === b.supplierId).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auctionLive(e) && (
              <div className="prx-inline">
                <select className="form-control" value={bid.supplierId} onChange={(x) => setBid({ ...bid, supplierId: x.target.value })} aria-label="Bidder">
                  <option value="">Bid on behalf of…</option>
                  {e.invited.map((i) => (
                    <option key={i.supplierId} value={i.supplierId}>
                      {name(i.supplierId)}
                    </option>
                  ))}
                </select>
                <input className="form-control" type="number" min="0" value={bid.amount || ''} onChange={(x) => setBid({ ...bid, amount: Number(x.target.value) })} placeholder="Total bid (KES)" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.placeBid(e.id, bid.supplierId, bid.amount, `${actor.name} (by phone)`).ok && setBid({ ...bid, amount: 0 })}>
                  <Gavel size={14} /> Place bid
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'messages' && (
          <>
            {e.messages.length === 0 && <p className="sx-muted">No questions or clarifications yet.</p>}
            {e.messages.map((m) => (
              <div key={m.id} className={`prx-msg ${m.side === 'SUPPLIER' ? 'supplier' : 'buyer'}`}>
                <b>{m.side === 'SUPPLIER' ? name(m.supplierId ?? '') : m.from}</b> {m.side === 'BUYER' && <span className="sx-tag">{m.public ? 'To all suppliers' : `To ${name(m.supplierId ?? '')}`}</span>}
                <div>{m.text}</div>
                <small>{m.at.slice(0, 16).replace('T', ' ')}</small>
              </div>
            ))}
            <div className="prx-inline">
              <input className="form-control" value={msg} onChange={(x) => setMsg(x.target.value)} placeholder="Clarification or answer…" />
              <label className="prx-inline">
                <input type="checkbox" checked={pub} onChange={(x) => setPub(x.target.checked)} /> All suppliers
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => ext.sourcing.postMessage(e.id, msg, { side: 'BUYER', public: pub, from: actor.name, supplierId: pub ? undefined : [...e.messages].reverse().find((m) => m.side === 'SUPPLIER')?.supplierId }).ok && setMsg('')}
              >
                <MessageSquare size={14} /> Post
              </button>
            </div>
          </>
        )}

        {tab === 'award' && <AwardTab e={e} name={name} />}

        {tab === 'files' && <Attachments owner={`event:${e.id}`} by={actor.name} readOnly={ext.readOnly} title="Event documents (specifications, drawings, terms)" />}
      </Drawer>
      {responding && <ResponseForm e={e} supplierId={responding} onBehalf by={actor.name} onClose={() => setResponding(null)} />}
      {scoring && <ScoreModal e={e} supplierId={scoring} name={name(scoring)} onClose={() => setScoring(null)} />}
    </>
  );
};

const ScoreModal: React.FC<{ e: SourcingEvent; supplierId: string; name: string; onClose: () => void }> = ({ e, supplierId, name, onClose }) => {
  const ext = useProcurementExt();
  const { actor } = useCommercial();
  const mine = e.evaluations.find((x) => x.evaluator === actor.name && x.supplierId === supplierId);
  const resp = latestResponses(e).find((r) => r.supplierId === supplierId);
  const [scores, setScores] = useState<Record<string, number>>(mine?.scores ?? {});
  const [comment, setComment] = useState(mine?.comment ?? '');
  return (
    <Modal
      size="lg"
      title={`Score ${name}`}
      subtitle={`${e.number} · as ${actor.name} · 0 = unacceptable, 5 = excellent`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.score(e.id, supplierId, scores, comment).ok && onClose()}>
            Save scores
          </button>
        </>
      }
    >
      {e.questionnaire.map((sec) => (
        <div key={sec.id}>
          <h4 className="sx-subhead">{sec.name}</h4>
          {sec.questions.map((qn) => (
            <div key={qn.id} className="prx-inline">
              <span style={{ flex: '3 1 240px' }}>
                {qn.text}
                <small className="sx-muted sx-block">Answer: {resp?.answers[qn.id] || '—'}</small>
              </span>
              <input className="form-control" type="number" min="0" max="5" value={scores[qn.id] ?? ''} onChange={(x) => setScores({ ...scores, [qn.id]: Number(x.target.value) })} aria-label={`Score: ${qn.text}`} style={{ maxWidth: 90 }} />
            </div>
          ))}
        </div>
      ))}
      <Field label="Comment" span={4}>
        <input className="form-control" value={comment} onChange={(x) => setComment(x.target.value)} />
      </Field>
    </Modal>
  );
};

const AwardTab: React.FC<{ e: SourcingEvent; name: (id: string) => string }> = ({ e, name }) => {
  const ext = useProcurementExt();
  const { setProcurement } = useCommercial();
  const lines = eventLines(e);
  const [maxSup, setMaxSup] = useState(2);
  const [maxLead, setMaxLead] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const opt = optimiseAward(e, { maxSuppliers: maxSup, maxLeadDays: maxLead || undefined, minScore: minScore || undefined });
  const bidders = e.auction ? bestBids(e).map((b) => b.supplierId) : latestResponses(e).map((r) => r.supplierId);
  const [alloc, setAlloc] = useState<Record<string, string>>(() => (e.auction ? Object.fromEntries(lines.map((l) => [l.id, bestBids(e)[0]?.supplierId ?? ''])) : Object.fromEntries(opt.groups.flatMap((g) => g.lineIds.map((l) => [l, g.supplierId])))));
  const [reason, setReason] = useState('');
  const [contract, setContract] = useState(false);
  if (e.status === 'AWARDED')
    return (
      <>
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th style={{ textAlign: 'right' }}>Lines</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th>Orders / contract</th>
            </tr>
          </thead>
          <tbody>
            {e.awards.map((a) => (
              <tr key={a.supplierId}>
                <td>{name(a.supplierId)}</td>
                <td style={{ textAlign: 'right' }}>{a.lineIds.length}</td>
                <td style={{ textAlign: 'right' }}>{kes(a.value)}</td>
                <td>
                  {a.poIds.map((id) => (
                    <button key={id} type="button" className="sx-link" onClick={() => setProcurement('orders', id)}>
                      {ext.ctx.com.state.purchaseOrders.find((o) => o.id === id)?.number}
                    </button>
                  ))}
                  {a.contractId && (
                    <button type="button" className="sx-link" onClick={() => ext.go('contracts', a.contractId!)}>
                      {ext.state.contracts.find((c) => c.id === a.contractId)?.number}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.sourcing.addAwardToCatalogue(e.id)}>
          Add award prices to the catalogue
        </button>
      </>
    );
  if (e.status !== 'CLOSED' && e.status !== 'EVALUATION') return <Empty title="Close the event to award it" text="Awards are made once responses are in and the event is closed." />;
  const allocTotal = round2(lines.reduce((s, l) => s + (alloc[l.id] ? ext.sourcing.awardPrice(e, alloc[l.id], l.id) * l.qty : 0), 0));
  return (
    <>
      {!e.auction && (
        <>
          <h4 className="sx-subhead">What-if: best split</h4>
          <div className="prx-inline">
            <label>
              Max suppliers <input className="form-control" type="number" min="1" value={maxSup} onChange={(x) => setMaxSup(Number(x.target.value))} style={{ maxWidth: 80 }} />
            </label>
            <label>
              Max lead days <input className="form-control" type="number" min="0" value={maxLead || ''} onChange={(x) => setMaxLead(Number(x.target.value))} style={{ maxWidth: 80 }} />
            </label>
            <label>
              Min score <input className="form-control" type="number" min="0" max="100" value={minScore || ''} onChange={(x) => setMinScore(Number(x.target.value))} style={{ maxWidth: 80 }} />
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAlloc(Object.fromEntries(opt.groups.flatMap((g) => g.lineIds.map((l) => [l, g.supplierId]))))}>
              Use this split
            </button>
          </div>
          <p className="sx-note">
            Optimised split {kes(opt.total)} across {opt.groups.length} supplier(s)
            {opt.single ? ` vs best single supplier ${name(opt.single.supplierId)} at ${kes(opt.single.value)} — saving ${kes(opt.saving)}` : ''}
            {opt.uncovered.length ? ` · not covered: ${opt.uncovered.join(', ')}` : ''}
          </p>
        </>
      )}
      <h4 className="sx-subhead">Allocate lines</h4>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Line</th>
            <th>Awarded to</th>
            <th style={{ textAlign: 'right' }}>Unit price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.description} × {l.qty}
              </td>
              <td>
                <select className="form-control" value={alloc[l.id] ?? ''} onChange={(x) => setAlloc({ ...alloc, [l.id]: x.target.value })} aria-label={`Award ${l.description}`}>
                  <option value="">Not awarded</option>
                  {bidders.map((s) => (
                    <option key={s} value={s}>
                      {name(s)}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ textAlign: 'right' }}>{alloc[l.id] ? ext.sourcing.awardPrice(e, alloc[l.id], l.id).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sx-note">Award value {kes(allocTotal)}</p>
      <div className="prx-inline">
        <input className="form-control" value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Award justification (needed when not the lowest)" />
        <label className="prx-inline">
          <input type="checkbox" checked={contract} onChange={(x) => setContract(x.target.checked)} /> Draft a contract for each supplier
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const groups = new Map<string, string[]>();
            for (const [lid, s] of Object.entries(alloc)) if (s) groups.set(s, [...(groups.get(s) ?? []), lid]);
            ext.sourcing.award(
              e.id,
              [...groups.entries()].map(([supplierId, lineIds]) => ({ supplierId, lineIds })),
              reason,
              contract
            );
          }}
        >
          <Award size={14} /> Award
        </button>
      </div>
    </>
  );
};
