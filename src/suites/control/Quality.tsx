import React, { useState } from 'react';
import { LayoutDashboard, ShieldCheck, ClipboardCheck, Wrench, Grid3x3, MessageSquareWarning, Plus, AlertTriangle, CheckCircle2, XCircle, Send, Flag } from 'lucide-react';
import { useControl, type QualityPage } from './store';
import { rating, riskScore, score } from './engine';
import { useCommercial } from '../commercial/store';
import { addDays, daysBetween, fmtDate, TODAY } from '../finance/engine';
import type { Audit, Capa, Complaint, Risk } from './types';
import { Chips, DataTable, DefList, Drawer, Field, FlowSteps, Hero, LinkButton, Modal, Panel, Pill, Stat, SuitePage, Timeline, TodoList, greeting, type Column, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useTopOnChange } from '../operations/parts';
import { CtlFooter, useCtlFocus } from './parts';

const LABEL: Record<QualityPage, string> = { overview: 'Overview', audits: 'Audits', capa: 'Corrective actions', risks: 'Risk register', complaints: 'Complaints' };
const CAPA_PILL: Record<Capa['status'], [string, string]> = { OPEN: ['DRAFT', 'Open'], IN_PROGRESS: ['OPEN', 'In progress'], VERIFY: ['SUBMITTED', 'Verify'], CLOSED: ['POSTED', 'Closed'] };
const SEV_PILL: Record<string, [string, string]> = { MAJOR: ['REJECTED', 'Major'], MINOR: ['SUBMITTED', 'Minor'], OBSERVATION: ['DRAFT', 'Observation'], HIGH: ['REJECTED', 'High'], MEDIUM: ['SUBMITTED', 'Medium'], LOW: ['DRAFT', 'Low'] };
const HEAT = (s: number) => (s >= 15 ? '#c9573f' : s >= 8 ? '#d1a54a' : '#5fa883');

const RiskMatrix: React.FC<{ risks: Risk[]; onPick?: (id: string) => void }> = ({ risks, onPick }) => (
  <div className="sx-heat">
    <span className="sx-heat-y">Likelihood</span>
    <div className="sx-heat-grid">
      {[5, 4, 3, 2, 1].map((l) =>
        [1, 2, 3, 4, 5].map((i) => {
          const here = risks.filter((r) => r.residualLikelihood === l && r.residualImpact === i);
          return (
            <div key={`${l}${i}`} style={{ background: `${HEAT(score(l, i))}${here.length ? '' : '33'}` }} title={`Likelihood ${l} × impact ${i}`}>
              {here.map((r) => (
                <button key={r.id} type="button" onClick={() => onPick?.(r.id)} title={r.title}>
                  {r.id.replace('rk', 'R')}
                </button>
              ))}
            </div>
          );
        })
      )}
    </div>
    <span className="sx-heat-x">Impact</span>
  </div>
);

const QOverview: React.FC = () => {
  const { state, actor, setQuality: go } = useControl();
  const commercial = useCommercial();
  const openCapa = state.capas.filter((c) => c.status !== 'CLOSED');
  const overdue = openCapa.filter((c) => c.due < TODAY);
  const high = state.risks.filter((r) => rating(riskScore(r)) === 'HIGH');
  const openCmp = state.complaints.filter((c) => c.status !== 'RESOLVED');
  const todo: TodoItem[] = [
    ...openCapa.filter((c) => c.status === 'VERIFY').map((c) => ({ id: c.id, tone: 'warning' as const, icon: <CheckCircle2 size={15} />, title: `Verify ${c.number}`, detail: c.problem, onClick: () => go('capa', c.id) })),
    ...overdue.map((c) => ({ id: `o${c.id}`, tone: 'critical' as const, icon: <Wrench size={15} />, title: `${c.number} is ${daysBetween(c.due, TODAY)} days overdue`, detail: `${c.problem} · ${c.owner}`, onClick: () => go('capa', c.id) })),
    ...openCmp.map((c) => ({ id: c.id, tone: (c.severity === 'HIGH' ? 'critical' : 'info') as TodoItem['tone'], icon: <MessageSquareWarning size={15} />, title: `${c.number}: ${commercial.party(c.customerId)?.name}`, detail: c.description, onClick: () => go('complaints', c.id) })),
    ...state.risks.filter((r) => r.nextReview < TODAY).map((r) => ({ id: r.id, tone: 'warning' as const, icon: <Grid3x3 size={15} />, title: `Review risk: ${r.title}`, detail: `Review was due ${fmtDate(r.nextReview)}`, onClick: () => go('risks', r.id) })),
    ...state.audits.filter((a) => a.status === 'IN_PROGRESS').map((a) => ({ id: a.id, tone: 'info' as const, icon: <ClipboardCheck size={15} />, title: `Finish ${a.number}`, detail: a.title, onClick: () => go('audits', a.id) }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Quality & risk"
        text={`${openCapa.length} open corrective actions · ${high.length} high risks · ${openCmp.length} open complaints`}
        actions={[
          { label: 'Log a complaint', icon: <MessageSquareWarning size={16} />, onClick: () => go('complaints', 'new') },
          { label: 'Audits', icon: <ClipboardCheck size={16} />, onClick: () => go('audits') },
          { label: 'Risk register', icon: <Grid3x3 size={16} />, onClick: () => go('risks') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Open corrective actions" value={openCapa.length} detail={`${overdue.length} overdue`} icon={<Wrench size={17} />} tone={overdue.length ? 'red' : 'green'} onClick={() => go('capa')} />
        <Stat label="High residual risks" value={high.length} detail={`${state.risks.length} risks on the register`} icon={<Grid3x3 size={17} />} tone="gold" onClick={() => go('risks')} />
        <Stat label="Open complaints" value={openCmp.length} detail={`${openCmp.filter((c) => c.severity === 'HIGH').length} high severity`} icon={<MessageSquareWarning size={17} />} tone="blue" onClick={() => go('complaints')} />
        <Stat label="Next audit" value={(() => { const a = state.audits.filter((x) => x.status === 'PLANNED').sort((x, y) => x.date.localeCompare(y.date))[0]; return a ? `${daysBetween(TODAY, a.date)} days` : '—'; })()} detail={state.audits.filter((x) => x.status === 'PLANNED').sort((x, y) => x.date.localeCompare(y.date))[0]?.title ?? ''} icon={<ClipboardCheck size={17} />} tone="violet" onClick={() => go('audits')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Verifications, overdue actions, complaints and reviews">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Residual risk heat map" subtitle="After controls" action={<LinkButton onClick={() => go('risks')}>Register</LinkButton>}>
          <RiskMatrix risks={state.risks} onPick={(id) => go('risks', id)} />
        </Panel>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const AuditsPage: React.FC = () => {
  const { state, quality } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  useCtlFocus(quality.focus, (id) => state.audits.some((a) => a.id === id), setOpenId);
  const columns: Column<Audit>[] = [
    { key: 'n', header: 'Audit', render: (a) => <b className="sx-mono">{a.number}</b>, sort: (a) => a.number, width: 130 },
    {
      key: 't',
      header: 'Scope',
      render: (a) => (
        <div className="sx-cell-main">
          <span>{a.title}</span>
          <small>
            {a.type} · {a.standard} · {a.auditor}
          </small>
        </div>
      )
    },
    { key: 'd', header: 'Date', render: (a) => fmtDate(a.date), sort: (a) => a.date },
    { key: 'f', header: 'Findings', render: (a) => `${a.findings.filter((f) => f.severity === 'MAJOR').length} major · ${a.findings.filter((f) => f.severity === 'MINOR').length} minor`, hideOnMobile: true },
    { key: 's', header: 'Status', render: (a) => <Pill status={{ PLANNED: 'DRAFT', IN_PROGRESS: 'OPEN', CLOSED: 'POSTED' }[a.status]} label={a.status === 'IN_PROGRESS' ? 'In progress' : a.status.charAt(0) + a.status.slice(1).toLowerCase()} /> }
  ];
  const open = state.audits.find((a) => a.id === openId);
  return (
    <SuitePage eyebrow="Quality" title="Audits" subtitle="Internal, supplier, customer and certification audits. Every major or minor finding gets a corrective action before the audit closes.">
      <DataTable rows={state.audits} columns={columns} rowKey={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />
      {open && <AuditDrawer a={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const AuditDrawer: React.FC<{ a: Audit; onClose: () => void }> = ({ a, onClose }) => {
  const { state, addFinding, closeAudit, raiseCapa, setQuality } = useControl();
  const [text, setText] = useState('');
  const [sev, setSev] = useState<'MAJOR' | 'MINOR' | 'OBSERVATION'>('MINOR');
  return (
    <Drawer
      wide
      title={a.number}
      subtitle={a.title}
      onClose={onClose}
      footer={
        a.status !== 'CLOSED' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => closeAudit(a.id)}>
            <CheckCircle2 size={14} /> Close audit
          </button>
        )
      }
    >
      <DefList items={[['Type', a.type], ['Standard', a.standard], ['Area', a.area], ['Auditor', a.auditor], ['Date', fmtDate(a.date)]]} />
      <h4 className="sx-subhead">Findings</h4>
      <ul className="sx-acts">
        {a.findings.map((f) => {
          const capa = state.capas.find((c) => c.id === f.capaId);
          return (
            <li key={f.id}>
              <Pill status={SEV_PILL[f.severity][0]} label={SEV_PILL[f.severity][1]} />
              <div>
                <b>{f.text}</b>
                {capa ? (
                  <small>
                    <button type="button" className="sx-link" onClick={() => setQuality('capa', capa.id)}>
                      {capa.number}
                    </button>{' '}
                    · {CAPA_PILL[capa.status][1]} · {capa.owner}
                  </small>
                ) : f.severity !== 'OBSERVATION' ? (
                  <small>
                    <button
                      type="button"
                      className="sx-link"
                      onClick={() => raiseCapa({ source: 'AUDIT', sourceRef: a.number, problem: f.text, owner: 'Mary Wambui', due: addDays(TODAY, 21) }, { auditId: a.id, findingId: f.id })}
                    >
                      Raise corrective action
                    </button>
                  </small>
                ) : null}
              </div>
            </li>
          );
        })}
        {!a.findings.length && <li className="sx-muted">No findings recorded yet.</li>}
      </ul>
      {a.status !== 'CLOSED' && (
        <div className="sx-log">
          <select className="form-control" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)} aria-label="Severity">
            <option value="MAJOR">Major</option>
            <option value="MINOR">Minor</option>
            <option value="OBSERVATION">Observation</option>
          </select>
          <input className="form-control" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe the finding…" style={{ gridColumn: 'span 2' }} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => addFinding(a.id, { text, severity: sev }).ok && setText('')}>
            <Plus size={14} /> Add
          </button>
        </div>
      )}
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */

const CapaPage: React.FC = () => {
  const { state, quality } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'CLOSED'>('OPEN');
  useCtlFocus(quality.focus, (id) => state.capas.some((c) => c.id === id), setOpenId);
  const rows = state.capas.filter((c) => filter === 'ALL' || (filter === 'OPEN' ? c.status !== 'CLOSED' : c.status === 'CLOSED'));
  const columns: Column<Capa>[] = [
    { key: 'n', header: 'Action', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number, width: 130 },
    {
      key: 'p',
      header: 'Problem',
      render: (c) => (
        <div className="sx-cell-main">
          <span>{c.problem}</span>
          <small>
            From {c.source.toLowerCase()} {c.sourceRef}
          </small>
        </div>
      )
    },
    { key: 'o', header: 'Owner', render: (c) => c.owner, sort: (c) => c.owner, hideOnMobile: true },
    { key: 'd', header: 'Due', render: (c) => <span className={c.status !== 'CLOSED' && c.due < TODAY ? 'sx-danger-text' : ''}>{fmtDate(c.due)}</span>, sort: (c) => c.due },
    { key: 's', header: 'Status', render: (c) => <Pill status={CAPA_PILL[c.status][0]} label={CAPA_PILL[c.status][1]} />, sort: (c) => c.status }
  ];
  const open = state.capas.find((c) => c.id === openId);
  return (
    <SuitePage eyebrow="Quality" title="Corrective actions" subtitle="Root cause, action, then verification by someone other than the owner that it actually worked.">
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'Open', count: state.capas.filter((c) => c.status !== 'CLOSED').length },
            { value: 'CLOSED', label: 'Closed', count: state.capas.filter((c) => c.status === 'CLOSED').length },
            { value: 'ALL', label: 'All', count: state.capas.length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setOpenId(c.id)} selected={openId} initialSort={{ key: 'd', dir: 'asc' }} />
      {open && <CapaDrawer c={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const CapaDrawer: React.FC<{ c: Capa; onClose: () => void }> = ({ c, onClose }) => {
  const { actor, progressCapa, verifyCapa } = useControl();
  const [root, setRoot] = useState(c.rootCause);
  const [act, setAct] = useState(c.action);
  const [note, setNote] = useState('');
  const at = { OPEN: 0, IN_PROGRESS: 1, VERIFY: 2, CLOSED: 4 }[c.status];
  return (
    <Drawer wide title={c.number} subtitle={c.problem} badge={<Pill status={CAPA_PILL[c.status][0]} label={CAPA_PILL[c.status][1]} />} onClose={onClose}>
      <FlowSteps steps={['Raised', 'Action', 'Verify', 'Closed']} at={at} />
      <DefList items={[['Source', `${c.source.toLowerCase()} · ${c.sourceRef}`], ['Owner', c.owner], ['Due', fmtDate(c.due)]]} />
      {c.status === 'OPEN' ? (
        <>
          <Field label="Root cause" span={4}>
            <textarea className="form-control" rows={2} value={root} onChange={(e) => setRoot(e.target.value)} placeholder="Why did it happen? (5 whys)" />
          </Field>
          <Field label="Corrective action" span={4}>
            <textarea className="form-control" rows={2} value={act} onChange={(e) => setAct(e.target.value)} placeholder="What will stop it happening again?" />
          </Field>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => progressCapa(c.id, root, act)}>
            <Send size={14} /> Agree action
          </button>
        </>
      ) : (
        <DefList items={[['Root cause', c.rootCause], ['Action', c.action]]} />
      )}
      {c.status === 'IN_PROGRESS' && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => progressCapa(c.id, '', '')}>
          <Flag size={14} /> Action completed
        </button>
      )}
      {c.status === 'VERIFY' && (
        <div className="sx-callout info">
          <CheckCircle2 size={16} />
          <div>
            <b>Verify effectiveness</b>
            <span>{actor.role === 'QHSE' ? 'Check the evidence that the problem has not come back.' : 'The QHSE Manager verifies — switch to Ruth Chebet.'}</span>
            <div className="sx-inline-form">
              <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Evidence or reason" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => verifyCapa(c.id, false, note)}>
                <XCircle size={14} /> Not effective
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => verifyCapa(c.id, true, note)}>
                <CheckCircle2 size={14} /> Effective — close
              </button>
            </div>
          </div>
        </div>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={c.history} />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */

const RisksPage: React.FC = () => {
  const { state, quality, rescoreRisk } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  useCtlFocus(quality.focus, (id) => state.risks.some((r) => r.id === id), setOpenId);
  const columns: Column<Risk>[] = [
    {
      key: 't',
      header: 'Risk',
      render: (r) => (
        <div className="sx-cell-main">
          <span>
            {r.id.replace('rk', 'R')} · {r.title}
          </span>
          <small>
            {r.category} · {r.owner}
          </small>
        </div>
      ),
      sort: (r) => r.title
    },
    { key: 'i', header: 'Inherent', render: (r) => score(r.likelihood, r.impact), sort: (r) => score(r.likelihood, r.impact), align: 'right', hideOnMobile: true },
    {
      key: 'r',
      header: 'Residual',
      render: (r) => <Pill status={{ HIGH: 'REJECTED', MEDIUM: 'SUBMITTED', LOW: 'POSTED' }[rating(riskScore(r))]} label={`${riskScore(r)} · ${rating(riskScore(r)).toLowerCase()}`} />,
      sort: riskScore
    },
    { key: 'v', header: 'Next review', render: (r) => <span className={r.nextReview < TODAY ? 'sx-danger-text' : ''}>{fmtDate(r.nextReview)}</span>, sort: (r) => r.nextReview, hideOnMobile: true }
  ];
  const open = state.risks.find((r) => r.id === openId);
  const [l, setL] = useState(3);
  const [i, setI] = useState(3);
  return (
    <SuitePage eyebrow="Risk" title="Risk register" subtitle="Inherent risk, the controls in place, and the residual risk that remains. Scores are likelihood × impact, 1–25.">
      <div className="sx-split">
        <DataTable rows={state.risks} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => (setOpenId(r.id), setL(r.residualLikelihood), setI(r.residualImpact))} selected={openId} initialSort={{ key: 'r', dir: 'desc' }} />
        <Panel title="Heat map" subtitle="Residual risk — click a marker">
          <RiskMatrix risks={state.risks} onPick={(id) => setOpenId(id)} />
        </Panel>
      </div>
      {open && (
        <Drawer title={open.title} subtitle={`${open.category} · owner ${open.owner}`} onClose={() => setOpenId(null)}>
          <DefList
            items={[
              ['Inherent', `${open.likelihood} × ${open.impact} = ${score(open.likelihood, open.impact)}`],
              ['Residual', `${open.residualLikelihood} × ${open.residualImpact} = ${riskScore(open)}`],
              ['Next review', fmtDate(open.nextReview)]
            ]}
          />
          <DefList items={[['Controls', open.controls], ['Treatment', open.treatment]]} />
          <h4 className="sx-subhead">Review the residual score</h4>
          <div className="sx-grid sx-grid-2">
            <Field label="Likelihood (1–5)">
              <input className="form-control" type="number" min="1" max="5" value={l} onChange={(e) => setL(Math.min(5, Math.max(1, Number(e.target.value))))} />
            </Field>
            <Field label="Impact (1–5)">
              <input className="form-control" type="number" min="1" max="5" value={i} onChange={(e) => setI(Math.min(5, Math.max(1, Number(e.target.value))))} />
            </Field>
          </div>
          <p className="sx-note">
            New score {score(l, i)} — {rating(score(l, i)).toLowerCase()}
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => rescoreRisk(open.id, l, i)}>
            Record review
          </button>
        </Drawer>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */

const ComplaintsPage: React.FC = () => {
  const { state, quality, raiseCapa, resolveComplaint, logComplaint, setQuality } = useControl();
  const commercial = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [resp, setResp] = useState('');
  useCtlFocus(quality.focus, (id) => state.complaints.some((c) => c.id === id), setOpenId, () => setAdding(true));
  const columns: Column<Complaint>[] = [
    { key: 'n', header: 'Complaint', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number, width: 130 },
    {
      key: 'c',
      header: 'Customer',
      render: (c) => (
        <div className="sx-cell-main">
          <span>{commercial.party(c.customerId)?.name}</span>
          <small>{c.description}</small>
        </div>
      )
    },
    { key: 'cat', header: 'Category', render: (c) => c.category, hideOnMobile: true },
    { key: 'sev', header: 'Severity', render: (c) => <Pill status={SEV_PILL[c.severity][0]} label={SEV_PILL[c.severity][1]} />, sort: (c) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(c.severity) },
    { key: 's', header: 'Status', render: (c) => <Pill status={{ NEW: 'DRAFT', INVESTIGATING: 'OPEN', RESOLVED: 'POSTED' }[c.status]} label={c.status.charAt(0) + c.status.slice(1).toLowerCase()} /> }
  ];
  const open = state.complaints.find((c) => c.id === openId);
  const [f, setF] = useState({ customerId: '', sku: 'STD-24', batch: '', category: 'Quality' as Complaint['category'], description: '', severity: 'MEDIUM' as Complaint['severity'] });
  return (
    <SuitePage
      eyebrow="Quality"
      title="Customer complaints"
      subtitle="Log, investigate and respond. High-severity complaints need a corrective action before they can be closed."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Log a complaint
        </button>
      }
    >
      <DataTable rows={state.complaints} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => (setOpenId(c.id), setResp(''))} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {open && (
        <Drawer title={open.number} subtitle={commercial.party(open.customerId)?.name} badge={<Pill status={SEV_PILL[open.severity][0]} label={SEV_PILL[open.severity][1]} />} onClose={() => setOpenId(null)}>
          <DefList items={[['Date', fmtDate(open.date)], ['Product', commercial.state.products.find((p) => p.sku === open.sku)?.name ?? open.sku], ['Batch', open.batch ?? '—'], ['Category', open.category]]} />
          <p className="sx-note">{open.description}</p>
          {open.capaId ? (
            <p className="sx-note">
              Corrective action{' '}
              <button type="button" className="sx-link" onClick={() => setQuality('capa', open.capaId!)}>
                {state.capas.find((x) => x.id === open.capaId)?.number}
              </button>
            </p>
          ) : (
            open.status !== 'RESOLVED' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => raiseCapa({ source: 'COMPLAINT', sourceRef: open.number, problem: open.description, owner: 'Mary Wambui', due: addDays(TODAY, 14) }, { complaintId: open.id })}>
                <Wrench size={14} /> Raise corrective action
              </button>
            )
          )}
          {open.status === 'RESOLVED' ? (
            <DefList items={[['Response', open.response ?? '']]} />
          ) : (
            <>
              <Field label="Response to the customer" span={4}>
                <textarea className="form-control" rows={2} value={resp} onChange={(e) => setResp(e.target.value)} />
              </Field>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveComplaint(open.id, resp)}>
                <CheckCircle2 size={14} /> Resolve
              </button>
            </>
          )}
        </Drawer>
      )}
      {adding && (
        <Modal
          size="lg"
          title="Log a customer complaint"
          onClose={() => setAdding(false)}
          footer={
            <>
              <span className="sx-grow" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => logComplaint({ ...f, batch: f.batch || undefined }).ok && setAdding(false)}>
                Log complaint
              </button>
            </>
          }
        >
          <div className="sx-grid">
            <Field label="Customer" required span={2}>
              <select className="form-control" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
                <option value="">Choose…</option>
                {commercial.finance.state.parties
                  .filter((p) => p.kind === 'CUSTOMER')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Product" span={2}>
              <select className="form-control" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })}>
                {commercial.state.products
                  .filter((p) => p.kind !== 'MATERIAL')
                  .map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Category">
              <select className="form-control" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Complaint['category'] })}>
                {['Quality', 'Delivery', 'Packaging', 'Documentation'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select className="form-control" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Complaint['severity'] })}>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </Field>
            <Field label="Batch (if known)" span={2}>
              <input className="form-control" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} />
            </Field>
            <Field label="What happened" required span={4}>
              <textarea className="form-control" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

export const QualitySidebar: React.FC = () => {
  const { state, quality, setQuality } = useControl();
  const groups: SuiteNavGroup<QualityPage>[] = [
    { label: 'Quality & risk', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Assure',
      items: [
        { id: 'audits', label: 'Audits', icon: ClipboardCheck, badge: state.audits.filter((a) => a.status === 'IN_PROGRESS').length, badgeTone: 'neutral' },
        { id: 'capa', label: 'Corrective actions', icon: Wrench, badge: state.capas.filter((c) => c.status !== 'CLOSED' && c.due < TODAY).length, badgeTone: 'critical' },
        { id: 'complaints', label: 'Complaints', icon: MessageSquareWarning, badge: state.complaints.filter((c) => c.status !== 'RESOLVED').length }
      ]
    },
    { label: 'Risk', items: [{ id: 'risks', label: 'Risk register', icon: AlertTriangle, badge: state.risks.filter((r) => r.nextReview < TODAY).length, badgeTone: 'critical' }] }
  ];
  return <SuiteSidebar name="Quality & Risk" tagline="Audit · correct · prevent" icon={ShieldCheck} groups={groups} active={quality.page} onSelect={(p) => setQuality(p)} footer={<CtlFooter />} />;
};
export const QualityCrumb: React.FC = () => {
  const { quality, setQuality } = useControl();
  return <Crumb name="Quality & Risk" page={quality.page} label={LABEL[quality.page]} onHome={() => setQuality('overview')} />;
};
export const QualitySuite: React.FC = () => {
  const { quality } = useControl();
  useTopOnChange(quality.page);
  return (
    <div className="sx-suite" key={quality.page}>
      {quality.page === 'overview' && <QOverview />}
      {quality.page === 'audits' && <AuditsPage />}
      {quality.page === 'capa' && <CapaPage />}
      {quality.page === 'risks' && <RisksPage />}
      {quality.page === 'complaints' && <ComplaintsPage />}
    </div>
  );
};
