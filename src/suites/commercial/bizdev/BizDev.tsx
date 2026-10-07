import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  KanbanSquare,
  Target,
  CalendarCheck,
  Plus,
  ChevronRight,
  Phone,
  Users,
  Mail,
  MapPin,
  Presentation,
  TrendingUp,
  Trophy,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  FileText,
  UserPlus,
  XCircle,
  RotateCcw,
  Handshake
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useCommercial, type BizDevPage } from '../store';
import { daysInStage, isStale, OPEN_STAGES, pipelineStats, STAGE_LABEL, STAGE_PROBABILITY, STAGES, weighted } from '../engine';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import type { Activity, Opportunity, Stage } from '../types';
import { Bars, Chips, DataTable, DefList, Drawer, Field, FlowSteps, LinkButton, Modal, Panel, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../../ui/SuiteSidebar';
import { ComActorSwitcher, PartySelect } from '../parts';

const LABEL: Record<BizDevPage, string> = { overview: 'Overview', pipeline: 'Pipeline', opportunities: 'Opportunities', activities: 'Activities' };
const STAGE_COLOR: Record<Stage, string> = { LEAD: '#b9d5c3', QUALIFIED: '#8fc2a6', PROPOSAL: '#5fa883', NEGOTIATION: '#237857', WON: '#153e33', LOST: '#c9573f' };
const STAGE_PILL: Record<Stage, string> = { LEAD: 'DRAFT', QUALIFIED: 'OPEN', PROPOSAL: 'SUBMITTED', NEGOTIATION: 'APPROVED', WON: 'POSTED', LOST: 'REJECTED' };
const ACT_ICON: Record<Activity['type'], React.ReactNode> = {
  CALL: <Phone size={14} />,
  MEETING: <Users size={14} />,
  EMAIL: <Mail size={14} />,
  VISIT: <MapPin size={14} />,
  DEMO: <Presentation size={14} />
};

const useAccount = () => {
  const { party } = useCommercial();
  return (o: Opportunity) => (o.customerId ? party(o.customerId)?.name ?? '' : `${o.prospect} (prospect)`);
};

/* ================================================================== */
/* Overview                                                            */
/* ================================================================== */

const BizDevOverview: React.FC = () => {
  const { state, actor, setBizdev: go } = useCommercial();
  const account = useAccount();
  const st = pipelineStats(state);
  const open = state.opportunities.filter((o) => OPEN_STAGES.includes(o.stage));
  const funnel = OPEN_STAGES.map((s) => {
    const list = open.filter((o) => o.stage === s);
    return { s, count: list.length, value: round2(list.reduce((x, o) => x + o.value, 0)) };
  });
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));
  const months = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(TODAY + 'T00:00:00');
    d.setMonth(d.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = open.filter((o) => o.expectedClose.slice(0, 7) === key);
    return { label: d.toLocaleDateString('en-GB', { month: 'short' }), values: [round2(list.reduce((x, o) => x + weighted(o), 0)), round2(list.reduce((x, o) => x + o.value, 0))] };
  });
  const overdue = state.activities.filter((a) => !a.done && a.due < TODAY);
  const stale = open.filter(isStale);
  const closing = open.filter((o) => o.expectedClose <= addDays(TODAY, 14));
  type Item = { id: string; tone: string; icon: React.ReactNode; title: string; detail: string; onClick: () => void };
  const items: Item[] = [
    ...overdue.map((a) => {
      const o = state.opportunities.find((x) => x.id === a.opportunityId)!;
      return { id: a.id, tone: 'critical', icon: ACT_ICON[a.type], title: a.subject, detail: `${o.name} · ${daysBetween(a.due, TODAY)} days overdue`, onClick: () => go('pipeline', o.id) };
    }),
    ...closing.map((o) => ({ id: `c${o.id}`, tone: 'warning', icon: <Target size={15} />, title: `Close ${o.name}`, detail: `${kes(o.value, { compact: true })} · expected ${fmtDate(o.expectedClose)}`, onClick: () => go('pipeline', o.id) })),
    ...stale.map((o) => ({ id: `s${o.id}`, tone: 'info', icon: <Clock3 size={15} />, title: `${o.name} has gone quiet`, detail: `${daysInStage(o)} days in ${STAGE_LABEL[o.stage].toLowerCase()}`, onClick: () => go('pipeline', o.id) }))
  ];
  const top = [...open].sort((a, b) => weighted(b) - weighted(a)).slice(0, 5);
  return (
    <div className="sx-page">
      <header className="sx-hero">
        <div>
          <span className="sx-eyebrow">
            Business development · {actor.name.split(' ')[0]}
          </span>
          <h1>Growth pipeline</h1>
          <p>
            {st.openCount} open opportunities worth {kes(st.openValue, { compact: true })} · forecast {kes(st.forecast90, { compact: true })} in the next 90 days
          </p>
        </div>
        <div className="sx-quick">
          <button type="button" onClick={() => go('pipeline', 'new')}>
            <Plus size={16} /> New opportunity
          </button>
          <button type="button" onClick={() => go('pipeline')}>
            <KanbanSquare size={16} /> Pipeline board
          </button>
          <button type="button" onClick={() => go('activities')}>
            <CalendarCheck size={16} /> Activities
          </button>
        </div>
      </header>
      <div className="sx-stats">
        <Stat label="Open pipeline" value={kes(st.openValue, { compact: true })} detail={`${st.openCount} opportunities`} icon={<KanbanSquare size={17} />} onClick={() => go('pipeline')} />
        <Stat label="Weighted forecast" value={kes(st.weighted, { compact: true })} detail="Value × stage probability" icon={<TrendingUp size={17} />} tone="blue" />
        <Stat label="Win rate this year" value={`${Math.round(st.winRate * 100)}%`} detail={`${kes(st.wonValue, { compact: true })} won`} icon={<Trophy size={17} />} tone="gold" onClick={() => go('opportunities')} />
        <Stat label="Average deal" value={kes(st.avgDeal, { compact: true })} detail="Won this year" icon={<Target size={17} />} tone="violet" />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="Pipeline by stage" subtitle="Open value at each step" action={<LinkButton onClick={() => go('pipeline')}>Board</LinkButton>}>
          <ul className="sx-funnel">
            {funnel.map((f) => (
              <li key={f.s}>
                <span className="sx-funnel-label">
                  <b>{STAGE_LABEL[f.s]}</b>
                  <small>
                    {f.count} · {Math.round(STAGE_PROBABILITY[f.s] * 100)}% likely
                  </small>
                </span>
                <span className="sx-funnel-bar">
                  <i style={{ width: `${Math.max(4, (f.value / funnelMax) * 100)}%`, background: STAGE_COLOR[f.s] }} />
                </span>
                <b>{kes(f.value, { compact: true })}</b>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Expected to close" subtitle="By month — weighted and full value">
          <Bars
            data={months}
            series={[
              { name: 'Weighted', color: '#237857' },
              { name: 'Full value', color: '#b9d5c3' }
            ]}
            height={200}
            format={(n) => kes(n, { compact: true }).replace('KES ', '')}
          />
        </Panel>
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {items.length > 0 && <span className="sx-count">{items.length}</span>}</>} subtitle="Overdue follow-ups, deals closing soon and deals that have gone quiet">
          <ul className="sx-todo">
            {items.slice(0, 8).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={i.onClick}>
                  <span className={`sx-todo-icon ${i.tone}`}>{i.icon}</span>
                  <span className="sx-todo-text">
                    <b>{i.title}</b>
                    <small>{i.detail}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Biggest weighted deals" subtitle="Where the forecast comes from">
          <table className="sx-mini-table">
            <tbody>
              {top.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => go('pipeline', o.id)}>
                  <td>
                    {o.name}
                    <small className="sx-muted sx-block">
                      {account(o)} · {STAGE_LABEL[o.stage]}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{kes(weighted(o), { compact: true })}</b>
                    <small className="sx-muted sx-block">of {kes(o.value, { compact: true })}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
};

/* ================================================================== */
/* Pipeline board                                                      */
/* ================================================================== */

const PipelinePage: React.FC = () => {
  const { state, bizdev, clearFocus, moveStage } = useCommercial();
  const account = useAccount();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [losing, setLosing] = useState<string | null>(null);
  useEffect(() => {
    if (bizdev.focus === 'new') setAdding(true);
    else if (bizdev.focus && state.opportunities.some((x) => x.id === bizdev.focus)) setOpenId(bizdev.focus);
    if (bizdev.focus) clearFocus();
  }, [bizdev.focus, state.opportunities, clearFocus]);
  const columns: Stage[] = [...OPEN_STAGES, 'WON', 'LOST'];
  const drop = (s: Stage) => {
    if (dragId) {
      if (s === 'LOST') setLosing(dragId);
      else moveStage(dragId, s);
    }
    setDragId(null);
    setOver(null);
  };
  return (
    <SuitePage
      eyebrow="Business development"
      title="Pipeline"
      subtitle="Drag a card to move it to the next stage. Cards turn amber when nothing has happened for three weeks."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New opportunity
        </button>
      }
    >
      <div className="sx-board">
        {columns.map((s) => {
          const list = state.opportunities.filter((o) => o.stage === s && (s !== 'WON' && s !== 'LOST' ? true : o.stageChanged >= addDays(TODAY, -90)));
          return (
            <section
              key={s}
              className={`sx-board-col ${over === s ? 'over' : ''} ${s === 'WON' || s === 'LOST' ? 'closed' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(s)}
            >
              <header>
                <i style={{ background: STAGE_COLOR[s] }} />
                <b>{STAGE_LABEL[s]}</b>
                <em>{list.length}</em>
                <small>{kes(round2(list.reduce((x, o) => x + o.value, 0)), { compact: true })}</small>
              </header>
              <div className="sx-board-cards">
                {list.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    draggable
                    onDragStart={() => setDragId(o.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setOpenId(o.id)}
                    className={`sx-card ${isStale(o) ? 'stale' : ''} ${dragId === o.id ? 'dragging' : ''}`}
                  >
                    <b>{o.name}</b>
                    <small>{account(o)}</small>
                    <div className="sx-card-foot">
                      <span>{kes(o.value, { compact: true })}</span>
                      <span className={o.expectedClose < TODAY && OPEN_STAGES.includes(o.stage) ? 'sx-danger-text' : ''}>
                        <Clock3 size={11} /> {fmtDate(o.expectedClose).slice(0, 6)}
                      </span>
                    </div>
                    {o.nextStep && OPEN_STAGES.includes(o.stage) && <em>Next: {o.nextStep}</em>}
                    {o.lostReason && <em>{o.lostReason}</em>}
                  </button>
                ))}
                {list.length === 0 && <p className="sx-board-empty">Drop here</p>}
              </div>
            </section>
          );
        })}
      </div>
      {losing && <LoseModal id={losing} onClose={() => setLosing(null)} />}
      {openId && <OpportunityDrawer id={openId} onClose={() => setOpenId(null)} />}
      {adding && (
        <OpportunityEditor
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const LoseModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { moveStage } = useCommercial();
  const [reason, setReason] = useState('');
  return (
    <Modal
      size="md"
      title="Why was this lost?"
      subtitle="Loss reasons feed the win/loss analysis"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-danger btn-sm" onClick={() => moveStage(id, 'LOST', reason).ok && onClose()}>
            Mark as lost
          </button>
        </>
      }
    >
      <Field label="Reason" span={4}>
        <select className="form-control" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose…</option>
          <option>Price — competitor cheaper</option>
          <option>Chose an incumbent supplier</option>
          <option>Budget cut or project cancelled</option>
          <option>Product did not fit the need</option>
          <option>No decision — went quiet</option>
        </select>
      </Field>
    </Modal>
  );
};

/* ================================================================== */
/* Opportunity drawer and editor                                       */
/* ================================================================== */

const OpportunityDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { state, moveStage, convertProspect, quoteFromOpportunity, logActivity, completeActivity, setTrading } = useCommercial();
  const { setCurrentView } = useApp();
  const account = useAccount();
  const o = state.opportunities.find((x) => x.id === id)!;
  const [losing, setLosing] = useState(false);
  const [act, setAct] = useState({ type: 'CALL' as Activity['type'], subject: '', due: addDays(TODAY, 2) });
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const acts = state.activities.filter((a) => a.opportunityId === id).sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due));
  const quote = state.quotations.find((q) => q.id === o.quotationId);
  const openQuote = (qid: string) => {
    setTrading('quotations', qid);
    setCurrentView('trading');
  };
  const idx = OPEN_STAGES.indexOf(o.stage);
  const nextStage = idx >= 0 && idx < OPEN_STAGES.length - 1 ? OPEN_STAGES[idx + 1] : null;
  return (
    <>
      <Drawer
        wide
        title={o.name}
        subtitle={account(o)}
        badge={<Pill status={STAGE_PILL[o.stage]} label={STAGE_LABEL[o.stage]} />}
        onClose={onClose}
        footer={
          OPEN_STAGES.includes(o.stage) && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLosing(true)}>
                <XCircle size={14} /> Lost
              </button>
              <span className="sx-grow" />
              {nextStage && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveStage(o.id, nextStage)}>
                  Move to {STAGE_LABEL[nextStage].toLowerCase()} <ChevronRight size={14} />
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => moveStage(o.id, 'WON')}>
                <Trophy size={14} /> Won
              </button>
            </>
          )
        }
      >
        <FlowSteps steps={['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won']} at={o.stage === 'WON' ? 5 : o.stage === 'LOST' ? 0 : idx} off={o.stage === 'LOST'} />
        <div className="sx-amount-hero">
          <div>
            <span>Value · weighted</span>
            <strong>{kes(o.value, { compact: true })}</strong>
            <span>
              {kes(weighted(o), { compact: true })} at {Math.round(STAGE_PROBABILITY[o.stage] * 100)}%
            </span>
          </div>
          <div>
            <span>Expected close</span>
            <b className={o.expectedClose < TODAY && OPEN_STAGES.includes(o.stage) ? 'sx-danger-text' : ''}>{fmtDate(o.expectedClose)}</b>
          </div>
        </div>
        {isStale(o) && (
          <div className="sx-callout warn">
            <AlertTriangle size={16} />
            <div>
              <b>Gone quiet</b>
              <span>{daysInStage(o)} days without moving stage — schedule a follow-up.</span>
            </div>
          </div>
        )}
        {o.lostReason && (
          <div className="sx-callout danger">
            <XCircle size={16} />
            <div>
              <b>Lost</b>
              <span>{o.lostReason}</span>
            </div>
          </div>
        )}
        <DefList
          items={[
            ['Contact', o.contact],
            ['Owner', o.owner],
            ['Source', o.source],
            ['Next step', o.nextStep || '—'],
            ['In stage for', `${daysInStage(o)} days`],
            ['Created', fmtDate(o.created)]
          ]}
        />
        <div className="sx-actions">
          {o.prospect && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => convertProspect(o.id)}>
              <UserPlus size={14} /> Convert to customer
            </button>
          )}
          {quote ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openQuote(quote.id)}>
              <FileText size={14} /> Open {quote.number} in Trading
            </button>
          ) : (
            OPEN_STAGES.includes(o.stage) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const r = quoteFromOpportunity(o.id);
                  if (r.ok && r.id) openQuote(r.id);
                }}
              >
                <FileText size={14} /> Create quotation
              </button>
            )
          )}
        </div>

        <h4 className="sx-subhead">Activities</h4>
        <ul className="sx-acts">
          {acts.map((a) => (
            <li key={a.id} className={a.done ? 'done' : a.due < TODAY ? 'late' : ''}>
              <span className="sx-act-icon">{ACT_ICON[a.type]}</span>
              <div>
                <b>{a.subject}</b>
                <small>
                  {a.done ? `Done · ${a.outcome}` : a.due < TODAY ? `${daysBetween(a.due, TODAY)} days overdue` : `Due ${fmtDate(a.due)}`} · {a.owner}
                </small>
                {!a.done && (
                  <div className="sx-inline-form">
                    <input className="form-control" placeholder="Outcome" value={outcome[a.id] ?? ''} onChange={(e) => setOutcome({ ...outcome, [a.id]: e.target.value })} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => completeActivity(a.id, outcome[a.id] ?? '')}>
                      <CheckCircle2 size={14} /> Done
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {OPEN_STAGES.includes(o.stage) && (
          <div className="sx-log">
            <select className="form-control" value={act.type} onChange={(e) => setAct({ ...act, type: e.target.value as Activity['type'] })} aria-label="Activity type">
              {(['CALL', 'MEETING', 'EMAIL', 'VISIT', 'DEMO'] as const).map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <input className="form-control" value={act.subject} onChange={(e) => setAct({ ...act, subject: e.target.value })} placeholder="Schedule a follow-up…" />
            <input className="form-control" type="date" value={act.due} onChange={(e) => setAct({ ...act, due: e.target.value })} aria-label="Due" />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (logActivity({ opportunityId: o.id, ...act }).ok) setAct({ ...act, subject: '' });
              }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
        <h4 className="sx-subhead">History</h4>
        <Timeline items={o.history} />
      </Drawer>
      {losing && <LoseModal id={o.id} onClose={() => setLosing(false)} />}
    </>
  );
};

const OpportunityEditor: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { saveOpportunity } = useCommercial();
  const [isProspect, setIsProspect] = useState(false);
  const [d, setD] = useState({ name: '', customerId: '', prospect: '', contact: '', value: 0, expectedClose: addDays(TODAY, 60), source: 'Inbound enquiry', nextStep: '' });
  return (
    <Modal
      size="lg"
      title="New opportunity"
      subtitle="Starts as a lead — move it along the pipeline as it develops"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = saveOpportunity({ ...d, customerId: isProspect ? undefined : d.customerId || undefined, prospect: isProspect ? d.prospect : undefined });
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Add to pipeline
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Opportunity" required span={4}>
          <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Hotel chain annual supply contract" autoFocus />
        </Field>
        <Field label="Account" span={2}>
          <div className="sx-chips sx-chips-inline">
            <button type="button" className={!isProspect ? 'active' : ''} onClick={() => setIsProspect(false)}>
              Existing customer
            </button>
            <button type="button" className={isProspect ? 'active' : ''} onClick={() => setIsProspect(true)}>
              New prospect
            </button>
          </div>
        </Field>
        <Field label={isProspect ? 'Prospect name' : 'Customer'} required span={2}>
          {isProspect ? <input className="form-control" value={d.prospect} onChange={(e) => setD({ ...d, prospect: e.target.value })} /> : <PartySelect kind="CUSTOMER" value={d.customerId} onChange={(v) => setD({ ...d, customerId: v })} />}
        </Field>
        <Field label="Contact person" span={2}>
          <input className="form-control" value={d.contact} onChange={(e) => setD({ ...d, contact: e.target.value })} placeholder="Name, role" />
        </Field>
        <Field label="Estimated value (KES)" required>
          <input className="form-control" type="number" min="0" value={d.value || ''} onChange={(e) => setD({ ...d, value: Number(e.target.value) })} />
        </Field>
        <Field label="Expected close">
          <input className="form-control" type="date" value={d.expectedClose} onChange={(e) => setD({ ...d, expectedClose: e.target.value })} />
        </Field>
        <Field label="Source" span={2}>
          <select className="form-control" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })}>
            {['Inbound enquiry', 'Referral', 'Existing customer', 'Trade fair', 'Website', 'Tender notice', 'Field visit', 'LinkedIn'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Next step" span={2}>
          <input className="form-control" value={d.nextStep} onChange={(e) => setD({ ...d, nextStep: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

/* ================================================================== */
/* Opportunities list                                                  */
/* ================================================================== */

const OpportunitiesPage: React.FC = () => {
  const { state, setBizdev } = useCommercial();
  const account = useAccount();
  const [stage, setStage] = useState<'ALL' | Stage>('ALL');
  const [q, setQ] = useState('');
  const rows = state.opportunities.filter((o) => (stage === 'ALL' || o.stage === stage) && (!q || `${o.name} ${account(o)}`.toLowerCase().includes(q.toLowerCase())));
  const columns: Column<Opportunity>[] = [
    {
      key: 'n',
      header: 'Opportunity',
      render: (o) => (
        <div className="sx-cell-main">
          <span>{o.name}</span>
          <small>{account(o)}</small>
        </div>
      ),
      sort: (o) => o.name
    },
    { key: 's', header: 'Stage', render: (o) => <Pill status={STAGE_PILL[o.stage]} label={STAGE_LABEL[o.stage]} />, sort: (o) => STAGES.indexOf(o.stage) },
    { key: 'v', header: 'Value', render: (o) => kes(o.value, { compact: true }), sort: (o) => o.value, align: 'right' },
    { key: 'w', header: 'Weighted', render: (o) => kes(weighted(o), { compact: true }), sort: weighted, align: 'right', hideOnMobile: true },
    { key: 'c', header: 'Close', render: (o) => fmtDate(o.expectedClose), sort: (o) => o.expectedClose, hideOnMobile: true },
    { key: 'o', header: 'Owner', render: (o) => o.owner, sort: (o) => o.owner, hideOnMobile: true }
  ];
  const won = state.opportunities.filter((o) => o.stage === 'WON');
  const lost = state.opportunities.filter((o) => o.stage === 'LOST');
  const reasons: Record<string, number> = {};
  for (const o of lost) reasons[o.lostReason ?? 'Unknown'] = (reasons[o.lostReason ?? 'Unknown'] ?? 0) + 1;
  return (
    <SuitePage eyebrow="Business development" title="Opportunities" subtitle="Every opportunity with its stage, value and owner — plus why deals are won and lost.">
      <div className="sx-stats">
        <Stat label="Won" value={won.length} detail={kes(round2(won.reduce((s, o) => s + o.value, 0)), { compact: true })} icon={<Trophy size={17} />} onClick={() => setStage('WON')} />
        <Stat label="Lost" value={lost.length} detail={Object.keys(reasons)[0] ?? '—'} icon={<XCircle size={17} />} tone="red" onClick={() => setStage('LOST')} />
        <Stat label="Open" value={state.opportunities.filter((o) => OPEN_STAGES.includes(o.stage)).length} icon={<Target size={17} />} tone="blue" onClick={() => setBizdev('pipeline')} />
        <Stat label="Gone quiet" value={state.opportunities.filter(isStale).length} detail="Over 3 weeks in the same stage" icon={<Clock3 size={17} />} tone="gold" />
      </div>
      <div className="sx-toolbar">
        <Chips value={stage} onChange={setStage} options={[{ value: 'ALL' as const, label: 'All', count: state.opportunities.length }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], count: state.opportunities.filter((o) => o.stage === s).length }))]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search opportunities…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => setBizdev('pipeline', o.id)} initialSort={{ key: 'v', dir: 'desc' }} />
    </SuitePage>
  );
};

/* ================================================================== */
/* Activities                                                          */
/* ================================================================== */

const ActivitiesPage: React.FC = () => {
  const { state, setBizdev, completeActivity } = useCommercial();
  const [view, setView] = useState<'OPEN' | 'DONE'>('OPEN');
  const groups =
    view === 'OPEN'
      ? [
          { label: 'Overdue', list: state.activities.filter((a) => !a.done && a.due < TODAY) },
          { label: 'Today', list: state.activities.filter((a) => !a.done && a.due === TODAY) },
          { label: 'This week', list: state.activities.filter((a) => !a.done && a.due > TODAY && a.due <= addDays(TODAY, 7)) },
          { label: 'Later', list: state.activities.filter((a) => !a.done && a.due > addDays(TODAY, 7)) }
        ]
      : [{ label: 'Completed', list: state.activities.filter((a) => a.done) }];
  return (
    <SuitePage eyebrow="Business development" title="Activities" subtitle="Calls, meetings, visits and demos that keep deals moving.">
      <div className="sx-toolbar">
        <Chips
          value={view}
          onChange={setView}
          options={[
            { value: 'OPEN', label: 'To do', count: state.activities.filter((a) => !a.done).length },
            { value: 'DONE', label: 'Done', count: state.activities.filter((a) => a.done).length }
          ]}
        />
      </div>
      <div className="sx-row">
        {groups
          .filter((g) => g.list.length)
          .map((g) => (
            <Panel key={g.label} title={<>{g.label} <span className="sx-count">{g.list.length}</span></>}>
              <ul className="sx-acts">
                {g.list
                  .sort((a, b) => a.due.localeCompare(b.due))
                  .map((a) => {
                    const o = state.opportunities.find((x) => x.id === a.opportunityId)!;
                    return (
                      <li key={a.id} className={a.done ? 'done' : a.due < TODAY ? 'late' : ''}>
                        <span className="sx-act-icon">{ACT_ICON[a.type]}</span>
                        <div>
                          <b>{a.subject}</b>
                          <small>
                            <button type="button" className="sx-link" onClick={() => setBizdev('pipeline', o.id)}>
                              {o.name}
                            </button>{' '}
                            · {fmtDate(a.due)} · {a.owner}
                          </small>
                          {a.done && a.outcome && <small>Outcome: {a.outcome}</small>}
                        </div>
                        {!a.done && (
                          <button type="button" className="sx-icon-btn" onClick={() => completeActivity(a.id, 'Done')} aria-label="Mark done" title="Mark done">
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          ))}
      </div>
    </SuitePage>
  );
};

/* ================================================================== */
/* Suite                                                               */
/* ================================================================== */

export const BizDevSidebar: React.FC = () => {
  const { state, bizdev, setBizdev, reset } = useCommercial();
  const groups: SuiteNavGroup<BizDevPage>[] = [
    { label: 'Growth', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Pipeline',
      items: [
        { id: 'pipeline', label: 'Pipeline board', icon: KanbanSquare, badge: state.opportunities.filter(isStale).length },
        { id: 'opportunities', label: 'Opportunities', icon: Target },
        { id: 'activities', label: 'Activities', icon: CalendarCheck, badge: state.activities.filter((a) => !a.done && a.due < TODAY).length, badgeTone: 'critical' }
      ]
    }
  ];
  return (
    <SuiteSidebar
      name="Business Development"
      tagline="Leads · pipeline · forecast"
      icon={Handshake}
      groups={groups}
      active={bizdev.page}
      onSelect={(p) => setBizdev(p)}
      footer={
        <div className="sx-side-actor">
          <ComActorSwitcher />
          <button type="button" className="sx-link sx-reset" onClick={reset}>
            <RotateCcw size={12} /> Reset demo data
          </button>
        </div>
      }
    />
  );
};

export const BizDevCrumb: React.FC = () => {
  const { bizdev, setBizdev } = useCommercial();
  return (
    <span className="sx-crumb">
      <button type="button" onClick={() => setBizdev('overview')}>
        Business Development
      </button>
      {bizdev.page !== 'overview' && (
        <>
          <ChevronRight size={11} />
          <b>{LABEL[bizdev.page]}</b>
        </>
      )}
    </span>
  );
};

export const BizDevSuite: React.FC = () => {
  const { bizdev } = useCommercial();
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [bizdev.page]);
  return (
    <div className="sx-suite" key={bizdev.page}>
      {bizdev.page === 'overview' && <BizDevOverview />}
      {bizdev.page === 'pipeline' && <PipelinePage />}
      {bizdev.page === 'opportunities' && <OpportunitiesPage />}
      {bizdev.page === 'activities' && <ActivitiesPage />}
    </div>
  );
};
