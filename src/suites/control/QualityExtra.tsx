import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, Flame, Lightbulb, Plus, Send, Siren, Star, Wrench, XCircle, BellRing, Gauge } from 'lucide-react';
import { useControl } from './store';
import { complaintEscalation, KRI_LABEL, kriState, kriValues, repeatNonConformities, riskActive, type KriExternal } from './engine';
import { DEPARTMENTS, EMERGENCY_NOTIFY, STAFF, TEA_GRADES } from './data2';
import { useCommercial } from '../commercial/store';
import { useFinance } from '../finance/store';
import { useOperations } from '../operations/store';
import { needsReorder } from '../commercial/engine';
import { addDays, ageing, daysBetween, fmtDate, kes, TODAY } from '../finance/engine';
import type { Audit, Capa, ChecklistItem, Complaint, Emergency, EmergencyType, Kri, KriMetric, Opportunity, Risk } from './types';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Panel, Pill, Stat, SuitePage, Timeline, type Column } from '../ui/kit';
import { Attachments, ExportCsvButton, PrintButton, esc } from '../../platform/Widgets';
import { CustomFields, EmailButton } from '../../platform/Extras';
import { useCtlFocus } from './parts';

const StaffList: React.FC<{ id: string }> = ({ id }) => (
  <datalist id={id}>
    {STAFF.map((s) => (
      <option key={s} value={s} />
    ))}
  </datalist>
);

/* ------------------------------------------------------------------ */
/* Raise a corrective action: owner, due date and review date chosen   */
/* ------------------------------------------------------------------ */

export const RaiseCapaModal: React.FC<{
  init: Pick<Capa, 'source' | 'sourceRef' | 'problem'> & { auditee?: string; days?: number };
  link?: { auditId: string; findingId: string } | { complaintId: string };
  onClose: () => void;
}> = ({ init, link, onClose }) => {
  const { raiseCapa } = useControl();
  const due0 = addDays(TODAY, init.days ?? 21);
  const [f, setF] = useState({ problem: init.problem, owner: '', due: due0, reviewDate: addDays(due0, 30), auditee: init.auditee ?? '' });
  return (
    <Modal
      title="Raise a corrective action"
      subtitle={`From ${init.source.toLowerCase()} ${init.sourceRef}`}
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => raiseCapa({ source: init.source, sourceRef: init.sourceRef, problem: f.problem, owner: f.owner, due: f.due, reviewDate: f.reviewDate, auditee: f.auditee || undefined }, link).ok && onClose()}>
          <Wrench size={14} /> Raise action
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Problem" required span={2}>
          <textarea className="form-control" rows={2} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value })} />
        </Field>
        <Field label="Owner" required hint="Person responsible for the action">
          <input className="form-control" list="capa-staff" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="Choose or type a name" />
          <StaffList id="capa-staff" />
        </Field>
        <Field label="Auditee / area head" hint="Kept informed">
          <input className="form-control" list="capa-staff" value={f.auditee} onChange={(e) => setF({ ...f, auditee: e.target.value })} />
        </Field>
        <Field label="Due date" required>
          <input className="form-control" type="date" min={TODAY} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value, reviewDate: f.reviewDate < e.target.value ? addDays(e.target.value, 30) : f.reviewDate })} />
        </Field>
        <Field label="Effectiveness review date" required hint="It cannot be closed before this date">
          <input className="form-control" type="date" min={f.due} value={f.reviewDate} onChange={(e) => setF({ ...f, reviewDate: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

export const ExtendCapa: React.FC<{ c: Capa }> = ({ c }) => {
  const { extendCapa } = useControl();
  const [due, setDue] = useState(addDays(c.due, 14));
  const [reason, setReason] = useState('');
  return (
    <div className="sx-inline-form">
      <input className="form-control" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="New due date" />
      <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the extension" />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => extendCapa(c.id, due, reason).ok && setReason('')}>
        <CalendarClock size={14} /> Extend
      </button>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Plan an audit                                                       */
/* ------------------------------------------------------------------ */

export const PlanAuditModal: React.FC<{ onClose: () => void; onPlanned?: (id: string) => void }> = ({ onClose, onPlanned }) => {
  const { planAudit, actor } = useControl();
  const [f, setF] = useState({ title: '', type: 'Internal' as Audit['type'], standard: 'ISO 22000', area: '', auditor: actor.name, auditee: '', date: addDays(TODAY, 14), scope: '', team: '' });
  const [items, setItems] = useState<ChecklistItem[]>([{ question: '', clause: '' }]);
  return (
    <Modal
      title="Plan an audit"
      subtitle="Scope, team, auditee, checklist and date. The auditor and auditee are notified."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = planAudit({ ...f, team: f.team.split(',').map((x) => x.trim()).filter(Boolean), checklist: items });
            if (r.ok) {
              onClose();
              if (r.id) onPlanned?.(r.id);
            }
          }}
        >
          <CalendarClock size={14} /> Plan audit
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Title" required span={4}>
          <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Tasting room hygiene — ISO 22000" />
        </Field>
        <Field label="Type">
          <select className="form-control" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Audit['type'] })}>
            {['Internal', 'External', 'Supplier', 'Customer'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Standard">
          <input className="form-control" value={f.standard} onChange={(e) => setF({ ...f, standard: e.target.value })} />
        </Field>
        <Field label="Area" required>
          <input className="form-control" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Blending factory" />
        </Field>
        <Field label="Date" required>
          <input className="form-control" type="date" min={TODAY} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Lead auditor" required>
          <input className="form-control" list="plan-staff" value={f.auditor} onChange={(e) => setF({ ...f, auditor: e.target.value })} />
          <StaffList id="plan-staff" />
        </Field>
        <Field label="Auditee">
          <input className="form-control" list="plan-staff" value={f.auditee} onChange={(e) => setF({ ...f, auditee: e.target.value })} />
        </Field>
        <Field label="Audit team" span={2} hint="Comma-separated">
          <input className="form-control" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} />
        </Field>
        <Field label="Scope" span={4}>
          <input className="form-control" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} placeholder="Processes, sites and records in scope" />
        </Field>
      </div>
      <h4 className="sx-subhead">Checklist</h4>
      {items.map((it, i) => (
        <div className="sx-inline-form" key={i}>
          <input className="form-control" value={it.question} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} placeholder="Question or criterion" />
          <input className="form-control" style={{ maxWidth: 160 }} value={it.clause ?? ''} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, clause: e.target.value } : x)))} placeholder="Clause" />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setItems([...items, { question: '', clause: '' }])}>
        <Plus size={12} /> Add question
      </button>
    </Modal>
  );
};

/** Printable audit report built from the audit and its corrective actions. */
export const auditReportHtml = (a: Audit, capas: Capa[]) => {
  const sevColor = { MAJOR: '#b42318', MINOR: '#b54708', OBSERVATION: '#475467' };
  const conform = (a.checklist ?? []).filter((c) => c.result === 'CONFORM').length;
  return `<h1>Audit report ${esc(a.number)}</h1><p class="muted">${esc(a.title)}</p>
  <table><tr><th>Type</th><td>${esc(a.type)}</td><th>Standard</th><td>${esc(a.standard)}</td></tr>
  <tr><th>Area</th><td>${esc(a.area)}</td><th>Date</th><td>${esc(a.date)}</td></tr>
  <tr><th>Lead auditor</th><td>${esc(a.auditor)}</td><th>Auditee</th><td>${esc(a.auditee ?? '—')}</td></tr>
  <tr><th>Scope</th><td colspan="3">${esc(a.scope ?? a.area)}</td></tr><tr><th>Status</th><td colspan="3">${esc(a.status)}</td></tr></table>
  ${a.checklist?.length ? `<h2>Checklist — ${conform} of ${a.checklist.length} conform</h2><table><tr><th>Question</th><th>Clause</th><th>Result</th></tr>${a.checklist.map((c) => `<tr><td>${esc(c.question)}</td><td>${esc(c.clause ?? '')}</td><td>${esc(c.result ?? 'Not answered')}</td></tr>`).join('')}</table>` : ''}
  <h2>Findings (${a.findings.filter((f) => f.severity === 'MAJOR').length} major · ${a.findings.filter((f) => f.severity === 'MINOR').length} minor · ${a.findings.filter((f) => f.severity === 'OBSERVATION').length} observations)</h2>
  <table><tr><th>Severity</th><th>Finding</th><th>Clause</th><th>Evidence</th><th>Auditee response</th><th>Corrective action</th></tr>
  ${a.findings
    .map((f) => {
      const c = capas.find((x) => x.id === f.capaId);
      return `<tr><td style="color:${sevColor[f.severity]};font-weight:700">${f.severity}</td><td>${esc(f.text)}</td><td>${esc(f.clause ?? '')}</td><td>${esc(f.evidence ?? '')}</td><td>${esc(f.auditeeResponse ?? '')}</td><td>${c ? `${esc(c.number)} — ${esc(c.owner)}, due ${esc(c.due)} (${esc(c.status)})` : f.severity === 'OBSERVATION' ? '—' : 'Not raised'}</td></tr>`;
    })
    .join('')}</table>
  <div class="sig"><div>Lead auditor: ${esc(a.auditor)}</div><div>Auditee: ${esc(a.auditee ?? '')}</div><div>QHSE Manager</div></div>`;
};

/* ------------------------------------------------------------------ */
/* Audit programme                                                     */
/* ------------------------------------------------------------------ */

export const ProgrammePage: React.FC = () => {
  const { state, saveProgramme, saveProgrammeArea, approveProgramme, generateAudits, remindAudits, actor, setQuality } = useControl();
  const [sel, setSel] = useState(state.programmes[0]?.id ?? '');
  const p = state.programmes.find((x) => x.id === sel) ?? state.programmes[0];
  const [newProg, setNewProg] = useState(false);
  const [pf, setPf] = useState({ year: Number(TODAY.slice(0, 4)) + 1, title: '', objectives: '', scope: '' });
  const [area, setArea] = useState({ area: '', standard: 'ISO 22000', frequencyMonths: 12, auditor: '', auditee: '', lastAudit: '' });
  return (
    <SuitePage
      eyebrow="Quality"
      title="Audit programme"
      subtitle="The annual plan: which areas are audited, against which standard, how often and by whom. Closing an audit rolls the area's next due date forward."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => remindAudits(14)}>
            <BellRing size={14} /> Remind auditors (14 days)
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewProg(true)}>
            <Plus size={14} /> New programme
          </button>
        </>
      }
    >
      <div className="sx-toolbar">
        <Chips value={p?.id ?? ''} onChange={setSel} options={state.programmes.map((x) => ({ value: x.id, label: `${x.year} · ${x.status === 'APPROVED' ? 'approved' : 'draft'}` }))} />
      </div>
      {p && (
        <>
          <Panel
            title={p.title}
            subtitle={`Prepared by ${p.preparedBy}${p.approvedBy ? ` · approved by ${p.approvedBy} on ${fmtDate(p.approvedAt!)}` : ' · awaiting management approval'}`}
            action={
              p.status === 'DRAFT' ? (
                <button type="button" className="btn btn-primary btn-xs" onClick={() => approveProgramme(p.id)}>
                  <CheckCircle2 size={12} /> Approve
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-xs" onClick={() => generateAudits(p.id, 60)}>
                  <CalendarClock size={12} /> Plan audits due in 60 days
                </button>
              )
            }
          >
            <DefList items={[['Objectives', p.objectives], ['Scope', p.scope], ['Status', <Pill key="s" status={p.status === 'APPROVED' ? 'APPROVED' : 'DRAFT'} />]]} />
          </Panel>
          <div className="sx-table-wrap">
            <div className="sx-table-scroll">
              <table className="sx-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Standard</th>
                    <th>Every</th>
                    <th>Auditor → auditee</th>
                    <th>Last audit</th>
                    <th>Next due</th>
                    <th>Planned audit</th>
                  </tr>
                </thead>
                <tbody>
                  {p.areas.map((a) => {
                    const planned = state.audits.find((x) => x.programmeAreaId === a.id && x.status !== 'CLOSED');
                    return (
                      <tr key={a.id}>
                        <td>
                          <b>{a.area}</b>
                        </td>
                        <td>{a.standard}</td>
                        <td>{a.frequencyMonths} mo</td>
                        <td>
                          {a.auditor} → {a.auditee}
                        </td>
                        <td>{a.lastAudit ? fmtDate(a.lastAudit) : '—'}</td>
                        <td className={a.nextDue < TODAY ? 'sx-danger-text' : daysBetween(TODAY, a.nextDue) <= 30 ? 'sx-warn-text' : ''}>{fmtDate(a.nextDue)}</td>
                        <td>
                          {planned ? (
                            <button type="button" className="sx-link" onClick={() => setQuality('audits', planned.id)}>
                              {planned.number} · {fmtDate(planned.date)}
                            </button>
                          ) : (
                            <span className="sx-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!p.areas.length && (
                    <tr>
                      <td colSpan={7} className="sx-muted">
                        No areas yet — add them below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {p.status === 'DRAFT' && (
            <Panel title="Add an area" subtitle={actor.role === 'QHSE' ? 'Auditors may not audit their own area' : 'The QHSE Manager prepares the programme'}>
              <div className="sx-grid">
                <Field label="Area" required>
                  <input className="form-control" value={area.area} onChange={(e) => setArea({ ...area, area: e.target.value })} />
                </Field>
                <Field label="Standard" required>
                  <input className="form-control" value={area.standard} onChange={(e) => setArea({ ...area, standard: e.target.value })} />
                </Field>
                <Field label="Every (months)" required>
                  <input className="form-control" type="number" min={1} max={36} value={area.frequencyMonths} onChange={(e) => setArea({ ...area, frequencyMonths: Number(e.target.value) })} />
                </Field>
                <Field label="Last audited">
                  <input className="form-control" type="date" value={area.lastAudit} onChange={(e) => setArea({ ...area, lastAudit: e.target.value })} />
                </Field>
                <Field label="Auditor" required>
                  <input className="form-control" list="prog-staff" value={area.auditor} onChange={(e) => setArea({ ...area, auditor: e.target.value })} />
                  <StaffList id="prog-staff" />
                </Field>
                <Field label="Auditee" required>
                  <input className="form-control" list="prog-staff" value={area.auditee} onChange={(e) => setArea({ ...area, auditee: e.target.value })} />
                </Field>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveProgrammeArea(p.id, { ...area, lastAudit: area.lastAudit || undefined }).ok && setArea({ ...area, area: '', auditee: '' })}>
                <Plus size={14} /> Add area
              </button>
            </Panel>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={p.history} />
        </>
      )}
      {newProg && (
        <Modal
          title="New audit programme"
          size="md"
          onClose={() => setNewProg(false)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const r = saveProgramme(pf);
                if (r.ok) {
                  setNewProg(false);
                  if (r.id) setSel(r.id);
                }
              }}
            >
              Create draft
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Year" required>
              <input className="form-control" type="number" value={pf.year} onChange={(e) => setPf({ ...pf, year: Number(e.target.value) })} />
            </Field>
            <Field label="Title" required>
              <input className="form-control" value={pf.title} onChange={(e) => setPf({ ...pf, title: e.target.value })} />
            </Field>
            <Field label="Objectives" required span={2}>
              <textarea className="form-control" rows={2} value={pf.objectives} onChange={(e) => setPf({ ...pf, objectives: e.target.value })} />
            </Field>
            <Field label="Scope" required span={2}>
              <textarea className="form-control" rows={2} value={pf.scope} onChange={(e) => setPf({ ...pf, scope: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Risks: create/edit, emerging risks and indicators                   */
/* ------------------------------------------------------------------ */

const CATS: Risk['category'][] = ['Operational', 'Financial', 'Compliance', 'Safety', 'Strategic', 'ICT'];

export const RiskFormModal: React.FC<{ mode: 'new' | 'emerging' | 'edit'; risk?: Risk; onClose: () => void }> = ({ mode, risk, onClose }) => {
  const { addRisk, raiseEmergingRisk, updateRisk } = useControl();
  const [f, setF] = useState({
    title: risk?.title ?? '',
    category: risk?.category ?? ('Operational' as Risk['category']),
    owner: risk?.owner ?? '',
    likelihood: risk?.likelihood ?? 3,
    impact: risk?.impact ?? 3,
    residualLikelihood: risk?.residualLikelihood ?? 2,
    residualImpact: risk?.residualImpact ?? 3,
    controls: risk?.controls ?? '',
    treatment: risk?.treatment ?? '',
    nextReview: risk?.nextReview ?? addDays(TODAY, 90)
  });
  const num = (k: keyof typeof f) => (
    <input className="form-control" type="number" min={1} max={5} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Math.min(5, Math.max(1, Number(e.target.value))) })} />
  );
  const save = () => {
    const r =
      mode === 'new'
        ? addRisk(f)
        : mode === 'emerging'
          ? raiseEmergingRisk(f)
          : updateRisk(risk!.id, { title: f.title, category: f.category, owner: f.owner, controls: f.controls, treatment: f.treatment, likelihood: f.likelihood, impact: f.impact, nextReview: f.nextReview });
    if (r.ok) onClose();
  };
  return (
    <Modal
      title={mode === 'new' ? 'Add a risk' : mode === 'emerging' ? 'Raise an emerging risk' : `Edit ${risk!.title}`}
      subtitle={mode === 'emerging' ? 'Anyone can raise one. It joins the register once reviewed under the approval rules.' : undefined}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          {mode === 'emerging' ? 'Submit for review' : 'Save risk'}
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Risk" required span={4}>
          <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Moisture damage to stored PF1 during long rains" />
        </Field>
        <Field label="Category">
          <select className="form-control" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Risk['category'] })}>
            {CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {mode !== 'emerging' && (
          <Field label="Owner" required>
            <input className="form-control" list="risk-staff" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
            <StaffList id="risk-staff" />
          </Field>
        )}
        <Field label="Likelihood (1–5)">{num('likelihood')}</Field>
        <Field label="Impact (1–5)">{num('impact')}</Field>
        {mode === 'new' && (
          <>
            <Field label="Residual likelihood">{num('residualLikelihood')}</Field>
            <Field label="Residual impact">{num('residualImpact')}</Field>
          </>
        )}
        {mode === 'edit' && (
          <Field label="Next review">
            <input className="form-control" type="date" value={f.nextReview} onChange={(e) => setF({ ...f, nextReview: e.target.value })} />
          </Field>
        )}
        <Field label="Current controls" required={mode !== 'emerging'} span={4}>
          <textarea className="form-control" rows={2} value={f.controls} onChange={(e) => setF({ ...f, controls: e.target.value })} />
        </Field>
        <Field label="Treatment" span={4}>
          <input className="form-control" value={f.treatment} onChange={(e) => setF({ ...f, treatment: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

/** Values for indicators that live in other suites. */
export const useKriExternal = (): KriExternal => {
  const com = useCommercial();
  const fin = useFinance();
  const ops = useOperations();
  return useMemo(() => {
    const ar = ageing(fin.state, 'INVOICE');
    return {
      lowStock: com.state.products.filter((p) => needsReorder(com.state, p)).length,
      overdueReceivablesPct: ar.total ? ((ar.total - ar.totals[0]) / ar.total) * 100 : 0,
      equipmentDown: ops.state.equipment.filter((e) => e.status === 'DOWN').length
    };
  }, [com.state, fin.state, ops.state]);
};

const KRI_PILL = { RED: ['REJECTED', 'Red'], AMBER: ['SUBMITTED', 'Amber'], GREEN: ['POSTED', 'Green'] } as const;

/** Every indicator on the register with its live value. */
export const RiskMonitor: React.FC<{ onPick?: (id: string) => void }> = ({ onPick }) => {
  const { state } = useControl();
  const vals = kriValues(state, useKriExternal());
  const rows = state.risks.filter(riskActive).flatMap((r) => (r.kris ?? []).map((k) => ({ r, k, v: vals[k.metric], s: kriState(k, vals[k.metric]) })));
  return (
    <ul className="sx-facts">
      {rows
        .sort((a, b) => ['RED', 'AMBER', 'GREEN'].indexOf(a.s) - ['RED', 'AMBER', 'GREEN'].indexOf(b.s))
        .map(({ r, k, v, s }) => (
          <li key={r.id + k.id}>
            <span>
              <Pill status={KRI_PILL[s][0]} label={KRI_PILL[s][1]} />{' '}
              <button type="button" className="sx-link" onClick={() => onPick?.(r.id)}>
                {k.name}
              </button>{' '}
              <small className="sx-muted">· {r.title}</small>
            </span>
            <b>
              {v}
              {k.metric === 'OVERDUE_RECEIVABLES_PCT' ? '%' : ''} <small className="sx-muted">/ {k.limit}</small>
            </b>
          </li>
        ))}
      {!rows.length && <li className="sx-muted">No indicators set.</li>}
    </ul>
  );
};

export const KriEditor: React.FC<{ r: Risk }> = ({ r }) => {
  const { state, saveKri, removeKri } = useControl();
  const vals = kriValues(state, useKriExternal());
  const [k, setK] = useState<Omit<Kri, 'id'>>({ name: '', metric: 'OVERDUE_CAPAS', warn: 1, limit: 3 });
  return (
    <>
      <h4 className="sx-subhead">Key risk indicators</h4>
      <ul className="sx-facts">
        {(r.kris ?? []).map((x) => {
          const s = kriState(x, vals[x.metric]);
          return (
            <li key={x.id}>
              <span>
                <Pill status={KRI_PILL[s][0]} label={KRI_PILL[s][1]} /> {x.name} <small className="sx-muted">amber ≥ {x.warn}, red ≥ {x.limit}</small>
              </span>
              <b>
                {vals[x.metric]}{' '}
                <button type="button" className="sx-link" onClick={() => removeKri(r.id, x.id)}>
                  remove
                </button>
              </b>
            </li>
          );
        })}
        {!(r.kris ?? []).length && <li className="sx-muted">No indicators yet.</li>}
      </ul>
      <div className="sx-inline-form">
        <select className="form-control" value={k.metric} onChange={(e) => setK({ ...k, metric: e.target.value as KriMetric, name: k.name || KRI_LABEL[e.target.value as KriMetric] })} aria-label="Measure">
          {(Object.keys(KRI_LABEL) as KriMetric[]).map((m) => (
            <option key={m} value={m}>
              {KRI_LABEL[m]}
            </option>
          ))}
        </select>
        <input className="form-control" style={{ maxWidth: 80 }} type="number" value={k.warn} onChange={(e) => setK({ ...k, warn: Number(e.target.value) })} aria-label="Amber at" title="Amber at" />
        <input className="form-control" style={{ maxWidth: 80 }} type="number" value={k.limit} onChange={(e) => setK({ ...k, limit: Number(e.target.value) })} aria-label="Red at" title="Red at" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveKri(r.id, { ...k, name: k.name || KRI_LABEL[k.metric] }).ok && setK({ ...k, name: '' })}>
          <Gauge size={14} /> Add indicator
        </button>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Improvement opportunities                                           */
/* ------------------------------------------------------------------ */

const OPP_PILL: Record<Opportunity['status'], [string, string]> = { SUBMITTED: ['SUBMITTED', 'For review'], ACCEPTED: ['APPROVED', 'Accepted'], REJECTED: ['REJECTED', 'Rejected'], IMPLEMENTED: ['POSTED', 'Implemented'] };

export const OpportunitiesPage: React.FC = () => {
  const { state, quality, raiseOpportunity, decideOpportunity, implementOpportunity } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const [f, setF] = useState({ title: '', description: '', source: 'STAFF' as Opportunity['source'], sourceRef: '', benefit: '', estValue: 0 });
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState('');
  useCtlFocus(quality.focus, (id) => state.opportunities.some((o) => o.id === id), setOpenId, () => setAdding(true));
  const rows = state.opportunities.filter((o) => filter === 'ALL' || o.status === 'SUBMITTED' || o.status === 'ACCEPTED');
  const columns: Column<Opportunity>[] = [
    { key: 'n', header: 'No.', render: (o) => <b className="sx-mono">{o.number}</b>, width: 130, sort: (o) => o.number },
    {
      key: 't',
      header: 'Opportunity',
      render: (o) => (
        <div className="sx-cell-main">
          <span>{o.title}</span>
          <small>
            {o.source.toLowerCase()} · raised by {o.raisedBy}
          </small>
        </div>
      )
    },
    { key: 'v', header: 'Est. benefit', render: (o) => kes(o.estValue, { compact: true }), sort: (o) => o.estValue, align: 'right' },
    { key: 's', header: 'Status', render: (o) => <Pill status={OPP_PILL[o.status][0]} label={OPP_PILL[o.status][1]} /> }
  ];
  const open = state.opportunities.find((o) => o.id === openId);
  return (
    <SuitePage
      eyebrow="Quality"
      title="Improvement opportunities"
      subtitle="Ideas from staff, audits, customers and risks. Reviewed under the approval rules (bigger benefits need a second approver), then implemented by a named owner."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Lightbulb size={14} /> Submit an idea
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="For review" value={state.opportunities.filter((o) => o.status === 'SUBMITTED').length} icon={<Lightbulb size={17} />} tone="gold" />
        <Stat label="In implementation" value={state.opportunities.filter((o) => o.status === 'ACCEPTED').length} icon={<Wrench size={17} />} tone="blue" />
        <Stat label="Benefit accepted" value={kes(state.opportunities.filter((o) => o.status === 'ACCEPTED' || o.status === 'IMPLEMENTED').reduce((s, o) => s + o.estValue, 0), { compact: true })} icon={<CheckCircle2 size={17} />} />
      </div>
      <div className="sx-toolbar">
        <Chips value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: 'Open' }, { value: 'ALL', label: 'All', count: state.opportunities.length }]} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => (setOpenId(o.id), setNote(''), setOwner(''))} selected={openId} />
      {open && (
        <Drawer title={open.number} subtitle={open.title} badge={<Pill status={OPP_PILL[open.status][0]} label={OPP_PILL[open.status][1]} />} onClose={() => setOpenId(null)}>
          <p className="sx-note">{open.description}</p>
          <DefList items={[['Source', `${open.source.toLowerCase()}${open.sourceRef ? ` · ${open.sourceRef}` : ''}`], ['Benefit', open.benefit], ['Estimated value', kes(open.estValue)], ['Approvals', open.approvals.map((a) => `${a.by} (${a.at})`).join(', ') || '—'], ['Owner', open.owner ?? '—'], ['Decision', open.decision ?? '—']]} />
          {open.status === 'SUBMITTED' && (
            <>
              <Field label="Decision note" span={4}>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Field label="Implementation owner (when accepting)" span={4}>
                <input className="form-control" list="opp-staff" value={owner} onChange={(e) => setOwner(e.target.value)} />
                <StaffList id="opp-staff" />
              </Field>
              <div className="sx-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideOpportunity(open.id, false, note, owner)}>
                  <XCircle size={14} /> Reject
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => decideOpportunity(open.id, true, note, owner)}>
                  <CheckCircle2 size={14} /> Approve
                </button>
              </div>
            </>
          )}
          {open.status === 'ACCEPTED' && (
            <div className="sx-inline-form">
              <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => implementOpportunity(open.id, note)}>
                <CheckCircle2 size={14} /> Mark implemented
              </button>
            </div>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={open.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          title="Submit an improvement idea"
          size="md"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => raiseOpportunity({ ...f, sourceRef: f.sourceRef || undefined }).ok && setAdding(false)}>
              <Send size={14} /> Submit
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Title" required span={2}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Description" required span={2}>
              <textarea className="form-control" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <Field label="Source">
              <select className="form-control" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Opportunity['source'] })}>
                {['STAFF', 'AUDIT', 'CUSTOMER', 'RISK', 'COMPLAINT'].map((x) => (
                  <option key={x} value={x}>
                    {x.charAt(0) + x.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference">
              <input className="form-control" value={f.sourceRef} onChange={(e) => setF({ ...f, sourceRef: e.target.value })} />
            </Field>
            <Field label="Benefit">
              <input className="form-control" value={f.benefit} onChange={(e) => setF({ ...f, benefit: e.target.value })} />
            </Field>
            <Field label="Estimated value (KES / year)">
              <input className="form-control" type="number" min={0} value={f.estValue} onChange={(e) => setF({ ...f, estValue: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Emergencies                                                         */
/* ------------------------------------------------------------------ */

const EM_TYPES: EmergencyType[] = ['Fire', 'Product recall', 'Chemical spill', 'IT outage', 'Flood', 'Injury', 'Security breach', 'Power failure'];
const EM_PILL: Record<Emergency['status'], [string, string]> = { ACTIVE: ['REJECTED', 'Active'], CONTAINED: ['SUBMITTED', 'Contained'], CLOSED: ['POSTED', 'Closed'] };

export const ReportEmergencyModal: React.FC<{ onClose: () => void; onDone?: (id: string) => void }> = ({ onClose, onDone }) => {
  const { reportEmergency } = useControl();
  const [f, setF] = useState({ cls: 1 as 1 | 2 | 3, type: 'Fire' as EmergencyType, site: '', description: '', injuries: false, firstAction: '' });
  return (
    <Modal
      title="Report an emergency"
      subtitle={`Class ${f.cls} alerts: ${EMERGENCY_NOTIFY[f.cls].join(', ')} (SMS${f.cls >= 2 ? ' and email' : ''} — simulated gateway)`}
      size="md"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = reportEmergency(f);
            if (r.ok) {
              onClose();
              if (r.id) onDone?.(r.id);
            }
          }}
        >
          <Siren size={14} /> Report and alert
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Class" required>
          <select className="form-control" value={f.cls} onChange={(e) => setF({ ...f, cls: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 — contained on site</option>
            <option value={2}>2 — serious, management</option>
            <option value={3}>3 — major, board and authorities</option>
          </select>
        </Field>
        <Field label="Type" required>
          <select className="form-control" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EmergencyType })}>
            {EM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Site / location" required span={2}>
          <input className="form-control" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="e.g. Bonded warehouse 2, Shimanzi" />
        </Field>
        <Field label="What is happening" required span={2}>
          <textarea className="form-control" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="First action taken" span={2}>
          <input className="form-control" value={f.firstAction} onChange={(e) => setF({ ...f, firstAction: e.target.value })} />
        </Field>
        <Field label="Anyone injured?">
          <label className="sx-check">
            <input type="checkbox" checked={f.injuries} onChange={(e) => setF({ ...f, injuries: e.target.checked })} /> Yes — also record in OSH incidents
          </label>
        </Field>
      </div>
    </Modal>
  );
};

export const EmergenciesPage: React.FC = () => {
  const { state, quality, addEmergencyAction, addAffected, containEmergency, closeEmergency, raiseEmergencyCapa, setQuality, actor } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [act, setAct] = useState('');
  const [aff, setAff] = useState({ ref: '', grade: 'BP1', qty: 0, unit: 'kg', value: 0 });
  const [lt, setLt] = useState({ text: '', owner: '', due: addDays(TODAY, 30) });
  useCtlFocus(quality.focus, (id) => state.emergencies.some((e) => e.id === id), setOpenId, () => setReporting(true));
  const columns: Column<Emergency>[] = [
    { key: 'n', header: 'No.', render: (e) => <b className="sx-mono">{e.number}</b>, width: 130, sort: (e) => e.number },
    { key: 'c', header: 'Class', render: (e) => <Pill status={e.cls === 3 ? 'REJECTED' : e.cls === 2 ? 'OVERDUE' : 'SUBMITTED'} label={`Class ${e.cls}`} />, sort: (e) => e.cls, width: 90 },
    {
      key: 't',
      header: 'Emergency',
      render: (e) => (
        <div className="sx-cell-main">
          <span>
            {e.type} — {e.site}
          </span>
          <small>{e.description}</small>
        </div>
      )
    },
    { key: 'a', header: 'Affected', render: (e) => (e.affected.length ? kes(e.affected.reduce((s, a) => s + a.value, 0), { compact: true }) : '—'), hideOnMobile: true, align: 'right' },
    { key: 's', header: 'Status', render: (e) => <Pill status={EM_PILL[e.status][0]} label={EM_PILL[e.status][1]} /> }
  ];
  const open = state.emergencies.find((e) => e.id === openId);
  const plan = open && state.emergencyPlans.find((p) => p.type === open.type);
  const reportHtml = (e: Emergency) =>
    `<h1>Emergency report ${esc(e.number)}</h1><p class="muted">Class ${e.cls} ${esc(e.type)} · ${esc(e.site)} · reported by ${esc(e.reportedBy)} at ${esc(e.at.replace('T', ' '))}</p><p>${esc(e.description)}</p>
    <h2>Immediate actions</h2><table><tr><th>When</th><th>By</th><th>Action</th></tr>${e.immediateActions.map((a) => `<tr><td>${esc(a.at.replace('T', ' '))}</td><td>${esc(a.by)}</td><td>${esc(a.text)}</td></tr>`).join('')}</table>
    <h2>Affected stock</h2><table><tr><th>Lot / invoice</th><th>Grade</th><th class="r">Quantity</th><th class="r">Value KES</th></tr>${e.affected.map((a) => `<tr><td>${esc(a.ref)}</td><td>${esc(a.grade)}</td><td class="r">${a.qty.toLocaleString()} ${esc(a.unit)}</td><td class="r">${a.value.toLocaleString()}</td></tr>`).join('')}</table>
    <h2>Long-term action</h2><p>${esc(e.longTerm ?? 'Not yet recorded')}</p><h2>Notified</h2><p>${esc(e.notified.join(', '))}</p>`;
  return (
    <SuitePage
      eyebrow="QHSE"
      title="Emergency response"
      subtitle="Report fires, recalls, spills, outages and other emergencies. The class decides who is alerted; immediate actions, affected tea and the long-term corrective action are kept on one record."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setReporting(true)}>
          <Siren size={14} /> Report an emergency
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Active" value={state.emergencies.filter((e) => e.status === 'ACTIVE').length} icon={<Flame size={17} />} tone="red" />
        <Stat label="Contained, not closed" value={state.emergencies.filter((e) => e.status === 'CONTAINED').length} icon={<Siren size={17} />} tone="gold" />
        <Stat label="Tea affected this year" value={`${state.emergencies.reduce((s, e) => s + e.affected.filter((a) => a.unit === 'kg').reduce((x, a) => x + a.qty, 0), 0).toLocaleString()} kg`} detail={kes(state.emergencies.reduce((s, e) => s + e.affected.reduce((x, a) => x + a.value, 0), 0), { compact: true })} icon={<ClipboardList size={17} />} />
      </div>
      <DataTable rows={state.emergencies} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => setOpenId(e.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      <Panel title="Emergency plans" subtitle="Procedure, assembly point and who to call for each type">
        <ul className="sx-facts">
          {state.emergencyPlans.map((p) => (
            <li key={p.type}>
              <span>
                <b>{p.type}</b> <small className="sx-muted">{p.procedure}</small>
              </span>
              <b>{p.contacts.join(', ')}</b>
            </li>
          ))}
        </ul>
      </Panel>
      {open && (
        <Drawer
          wide
          title={`${open.number} · ${open.type}`}
          subtitle={`${open.site} · class ${open.cls} · reported by ${open.reportedBy}`}
          badge={<Pill status={EM_PILL[open.status][0]} label={EM_PILL[open.status][1]} />}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <PrintButton title={`Emergency ${open.number}`} html={() => reportHtml(open)} label="Emergency report" />
              <EmailButton module="Emergency" subject={`Emergency report ${open.number}`} body={() => `${open.type} at ${open.site}: ${open.description}`} refNo={open.number} />
            </>
          }
        >
          <p className="sx-note">{open.description}</p>
          {open.injuries && <div className="sx-callout danger"><Siren size={16} /><div><b>Injuries reported</b><span>Record the injury in People &amp; Payroll › OSH & Security.</span></div></div>}
          {plan && <DefList items={[['Procedure', plan.procedure], ['Assembly point', plan.assembly], ['Alerted', open.notified.join(', ')]]} />}
          <h4 className="sx-subhead">Immediate actions</h4>
          <ul className="sx-acts">
            {open.immediateActions.map((a, i) => (
              <li key={i}>
                <div>
                  <b>{a.text}</b>
                  <small>
                    {a.by} · {a.at.replace('T', ' ')}
                  </small>
                </div>
              </li>
            ))}
          </ul>
          {open.status !== 'CLOSED' && (
            <div className="sx-inline-form">
              <input className="form-control" value={act} onChange={(e) => setAct(e.target.value)} placeholder="Action taken…" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addEmergencyAction(open.id, act).ok && setAct('')}>
                <Plus size={14} /> Log action
              </button>
            </div>
          )}
          <h4 className="sx-subhead">Affected tea and documents</h4>
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Lot / invoice / batch</th>
                <th>Grade</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {open.affected.map((a, i) => (
                <tr key={i}>
                  <td>{a.ref}</td>
                  <td>{a.grade}</td>
                  <td style={{ textAlign: 'right' }}>
                    {a.qty.toLocaleString()} {a.unit}
                  </td>
                  <td style={{ textAlign: 'right' }}>{kes(a.value)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <b>Total</b>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <b>{open.affected.filter((a) => a.unit === 'kg').reduce((s, a) => s + a.qty, 0).toLocaleString()} kg</b>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <b>{kes(open.affected.reduce((s, a) => s + a.value, 0))}</b>
                </td>
              </tr>
            </tbody>
          </table>
          {open.status !== 'CLOSED' && (
            <div className="sx-inline-form">
              <input className="form-control" value={aff.ref} onChange={(e) => setAff({ ...aff, ref: e.target.value })} placeholder="Lot 2231 / INV-… / BAT-…" />
              <select className="form-control" value={aff.grade} onChange={(e) => setAff({ ...aff, grade: e.target.value })} aria-label="Grade">
                {TEA_GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <input className="form-control" style={{ maxWidth: 100 }} type="number" value={aff.qty} onChange={(e) => setAff({ ...aff, qty: Number(e.target.value) })} aria-label="Quantity kg" />
              <input className="form-control" style={{ maxWidth: 120 }} type="number" value={aff.value} onChange={(e) => setAff({ ...aff, value: Number(e.target.value) })} aria-label="Value KES" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addAffected(open.id, aff).ok && setAff({ ...aff, ref: '', qty: 0, value: 0 })}>
                <Plus size={14} /> Add
              </button>
            </div>
          )}
          <h4 className="sx-subhead">Long-term action</h4>
          {open.capaId ? (
            <p className="sx-note">
              {open.longTerm} ·{' '}
              <button type="button" className="sx-link" onClick={() => setQuality('capa', open.capaId!)}>
                {state.capas.find((c) => c.id === open.capaId)?.number}
              </button>
            </p>
          ) : open.status !== 'CLOSED' ? (
            <div className="sx-grid sx-grid-2">
              <Field label="Preventive action" span={2}>
                <input className="form-control" value={lt.text} onChange={(e) => setLt({ ...lt, text: e.target.value })} />
              </Field>
              <Field label="Owner">
                <input className="form-control" list="em-staff" value={lt.owner} onChange={(e) => setLt({ ...lt, owner: e.target.value })} />
                <StaffList id="em-staff" />
              </Field>
              <Field label="Due">
                <input className="form-control" type="date" value={lt.due} onChange={(e) => setLt({ ...lt, due: e.target.value })} />
              </Field>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => raiseEmergencyCapa(open.id, lt.owner, lt.due, lt.text)}>
                <Wrench size={14} /> Raise corrective action
              </button>
            </div>
          ) : (
            <p className="sx-note">{open.longTerm ?? '—'}</p>
          )}
          <div className="sx-actions">
            {open.status === 'ACTIVE' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => containEmergency(open.id)}>
                <CheckCircle2 size={14} /> Mark contained
              </button>
            )}
            {open.status === 'CONTAINED' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => closeEmergency(open.id, lt.text)} title={actor.role === 'QHSE' ? '' : 'The QHSE Manager closes emergencies'}>
                <CheckCircle2 size={14} /> Close emergency
              </button>
            )}
          </div>
          <CustomFields entity="qa-emergency" owner={`emergency:${open.id}`} by={actor.name} />
          <Attachments owner={`quality:${open.number}`} by={actor.name} readOnly={open.status === 'CLOSED'} title="Photos and reports" />
          <h4 className="sx-subhead">History</h4>
          <Timeline items={open.history} />
        </Drawer>
      )}
      {reporting && <ReportEmergencyModal onClose={() => setReporting(false)} onDone={setOpenId} />}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Exception reports                                                   */
/* ------------------------------------------------------------------ */

export const ReportsPage: React.FC = () => {
  const { state } = useControl();
  const com = useCommercial();
  const [days, setDays] = useState<'90' | '365' | '730'>('365');
  const rep = repeatNonConformities(state, Number(days));
  const overdue = state.capas.filter((c) => c.status !== 'CLOSED' && c.due < TODAY);
  const extended = state.capas.filter((c) => (c.extensions?.length ?? 0) > 0);
  const rated = state.complaints.filter((c) => c.feedback);
  const avg = rated.length ? rated.reduce((s, c) => s + c.feedback!.rating, 0) / rated.length : 0;
  const escalated = state.complaints.filter((c) => complaintEscalation(c, state.complaints).level > 0);
  const Section: React.FC<{ title: string; rows: { key: string; count: number }[]; label?: (k: string) => string }> = ({ title, rows, label = (k) => k }) => (
    <Panel title={title} subtitle={rows.length ? `${rows.length} repeating` : 'Nothing repeats'}>
      <ul className="sx-facts">
        {rows.map((r) => (
          <li key={r.key}>
            <span>{label(r.key)}</span>
            <b className={r.count >= 3 ? 'sx-danger-text' : ''}>{r.count}×</b>
          </li>
        ))}
        {!rows.length && <li className="sx-muted">No repeats in the period.</li>}
      </ul>
    </Panel>
  );
  return (
    <SuitePage
      eyebrow="Quality"
      title="Exception reports"
      subtitle="Repeated non-conformities and complaints, overdue and extended actions, escalations and customer satisfaction."
      actions={
        <ExportCsvButton
          name="quality-exceptions"
          header={['Report', 'Group', 'Count']}
          rows={() => [
            ...rep.byArea.map((r) => ['Findings by area', r.key, r.count]),
            ...rep.byClause.map((r) => ['Findings by clause', r.key, r.count]),
            ...rep.bySku.map((r) => ['Complaints by product', r.key, r.count]),
            ...rep.byCategory.map((r) => ['Complaints by category', r.key, r.count]),
            ...rep.byCustomer.map((r) => ['Complaints by customer', com.party(r.key)?.name ?? r.key, r.count]),
            ...overdue.map((c) => ['Overdue corrective action', c.number, daysBetween(c.due, TODAY)])
          ]}
        />
      }
    >
      <div className="sx-toolbar">
        <Chips value={days} onChange={setDays} options={[{ value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }, { value: '730', label: 'Last 2 years' }]} />
      </div>
      <div className="sx-stats">
        <Stat label="Overdue corrective actions" value={overdue.length} icon={<Wrench size={17} />} tone={overdue.length ? 'red' : 'green'} />
        <Stat label="Extended actions" value={extended.length} detail="Due date moved at least once" icon={<CalendarClock size={17} />} tone="gold" />
        <Stat label="Escalated complaints" value={escalated.length} icon={<BellRing size={17} />} tone={escalated.length ? 'red' : 'green'} />
        <Stat label="Customer satisfaction" value={rated.length ? `${avg.toFixed(1)} / 5` : '—'} detail={`${rated.length} rated resolutions`} icon={<Star size={17} />} tone="blue" />
      </div>
      <div className="sx-row">
        <Section title="Findings by area" rows={rep.byArea} />
        <Section title="Findings by clause" rows={rep.byClause} />
        <Section title="Complaints by product" rows={rep.bySku} label={(k) => com.state.products.find((p) => p.sku === k)?.name ?? k} />
        <Section title="Complaints by category" rows={rep.byCategory} />
        <Section title="Complaints by customer" rows={rep.byCustomer} label={(k) => com.party(k)?.name ?? k} />
        <Panel title="Overdue corrective actions" subtitle="Oldest first">
          <ul className="sx-facts">
            {overdue
              .sort((a, b) => a.due.localeCompare(b.due))
              .map((c) => (
                <li key={c.id}>
                  <span>
                    {c.number} · {c.problem} <small className="sx-muted">· {c.owner}</small>
                  </span>
                  <b className="sx-danger-text">{daysBetween(c.due, TODAY)} d</b>
                </li>
              ))}
            {!overdue.length && <li className="sx-muted">None overdue.</li>}
          </ul>
        </Panel>
      </div>
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Customer complaints portal                                          */
/* ------------------------------------------------------------------ */

export const PortalPage: React.FC = () => {
  const { state, submitPortalComplaint, recordFeedback } = useControl();
  const com = useCommercial();
  const customers = com.finance.state.parties.filter((p) => p.kind === 'CUSTOMER');
  const [who, setWho] = useState(customers[0]?.id ?? '');
  const [f, setF] = useState({ sku: com.state.products.find((p) => p.kind !== 'MATERIAL')?.sku ?? '', batch: '', category: 'Quality' as Complaint['category'], description: '', contact: '' });
  const [rating, setRating] = useState<Record<string, { r: number; c: string }>>({});
  const mine = state.complaints.filter((c) => c.customerId === who);
  return (
    <SuitePage eyebrow="Customer portal" title="Complaints and feedback" subtitle="What customers see on the self-service portal: raise a complaint, follow its progress and rate how it was handled. (Choose the customer you are acting for — the portal sign-in is simulated.)">
      <div className="sx-callout info">
        <ClipboardList size={16} />
        <div>
          <b>Signed in to the portal as</b>
          <select className="form-control" style={{ maxWidth: 320 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Customer">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="Raise a complaint" subtitle="We reply within 2 working days">
          <div className="sx-grid sx-grid-2">
            <Field label="Product">
              <select className="form-control" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })}>
                {com.state.products
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
            <Field label="Invoice or batch number">
              <input className="form-control" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} />
            </Field>
            <Field label="Your email" required>
              <input className="form-control" type="email" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="buyer@customer.co.ke" />
            </Field>
            <Field label="What happened" required span={2}>
              <textarea className="form-control" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => submitPortalComplaint({ customerId: who, sku: f.sku, batch: f.batch || undefined, category: f.category, description: f.description }, f.contact).ok && setF({ ...f, description: '', batch: '' })}>
            <Send size={14} /> Submit complaint
          </button>
        </Panel>
        <Panel title="Your complaints" subtitle={`${mine.length} on record`}>
          <ul className="sx-acts">
            {mine.map((c) => (
              <li key={c.id}>
                <Pill status={{ NEW: 'DRAFT', INVESTIGATING: 'OPEN', RESOLVED: 'POSTED' }[c.status]} label={c.status === 'NEW' ? 'Received' : c.status === 'INVESTIGATING' ? 'Being investigated' : 'Resolved'} />
                <div>
                  <b>
                    {c.number} · {c.description}
                  </b>
                  <small>
                    {fmtDate(c.date)}
                    {c.response ? ` · Our response: ${c.response}` : ''}
                  </small>
                  {c.status === 'RESOLVED' &&
                    (c.feedback ? (
                      <small>
                        You rated this {c.feedback.rating}/5 {c.feedback.comment && `— “${c.feedback.comment}”`}
                      </small>
                    ) : (
                      <div className="sx-inline-form">
                        <select className="form-control" style={{ maxWidth: 120 }} value={rating[c.id]?.r ?? 5} onChange={(e) => setRating({ ...rating, [c.id]: { r: Number(e.target.value), c: rating[c.id]?.c ?? '' } })} aria-label="Rating">
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {'★'.repeat(n)} {n}
                            </option>
                          ))}
                        </select>
                        <input className="form-control" value={rating[c.id]?.c ?? ''} onChange={(e) => setRating({ ...rating, [c.id]: { r: rating[c.id]?.r ?? 5, c: e.target.value } })} placeholder="Comment (optional)" />
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => recordFeedback(c.id, rating[c.id]?.r ?? 5, rating[c.id]?.c ?? '')}>
                          <Star size={12} /> Rate
                        </button>
                      </div>
                    ))}
                </div>
              </li>
            ))}
            {!mine.length && <li className="sx-muted">No complaints from this customer.</li>}
          </ul>
        </Panel>
      </div>
    </SuitePage>
  );
};

/** Complaint extras shown in the complaint drawer: channel, escalation, feedback and attachments. */
export const ComplaintExtras: React.FC<{ c: Complaint }> = ({ c }) => {
  const { state, acknowledgeComplaint, escalateComplaint, recordFeedback, actor } = useControl();
  const esc2 = complaintEscalation(c, state.complaints);
  const [r, setR] = useState(5);
  const [cm, setCm] = useState('');
  return (
    <>
      <DefList items={[['Channel', c.channel ?? '—'], ['Acknowledged', c.acknowledgedAt ? fmtDate(c.acknowledgedAt) : 'Not yet'], ['Escalations', (c.escalations ?? []).map((e) => `L${e.level} → ${e.to}`).join(', ') || '—']]} />
      {c.status !== 'RESOLVED' && (
        <div className="sx-actions">
          {!c.acknowledgedAt && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => acknowledgeComplaint(c.id)}>
              <Send size={14} /> Acknowledge to customer
            </button>
          )}
          {esc2.level > 0 && !(c.escalations ?? []).some((e) => e.level >= esc2.level) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => escalateComplaint(c.id, esc2.level, esc2.reasons.join('; '), esc2.to)}>
              <BellRing size={14} /> Escalate to {esc2.to}
            </button>
          )}
        </div>
      )}
      {esc2.level > 0 && (
        <div className="sx-callout warn">
          <BellRing size={16} />
          <div>
            <b>Escalation level {esc2.level}</b>
            <span>{esc2.reasons.join(' · ')}</span>
          </div>
        </div>
      )}
      {c.status === 'RESOLVED' &&
        (c.feedback ? (
          <DefList items={[['Customer rating', `${'★'.repeat(c.feedback.rating)} ${c.feedback.rating}/5`], ['Comment', c.feedback.comment || '—']]} />
        ) : (
          <div className="sx-inline-form">
            <select className="form-control" style={{ maxWidth: 110 }} value={r} onChange={(e) => setR(Number(e.target.value))} aria-label="Customer rating">
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
            <input className="form-control" value={cm} onChange={(e) => setCm(e.target.value)} placeholder="Customer's comment" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => recordFeedback(c.id, r, cm)}>
              <Star size={14} /> Record feedback
            </button>
          </div>
        ))}
      <CustomFields entity="qa-complaint" owner={`complaint:${c.id}`} by={actor.name} />
      <Attachments owner={`quality:${c.number}`} by={actor.name} title="Photos, samples and letters" />
      {c.history?.length ? (
        <>
          <h4 className="sx-subhead">History</h4>
          <Timeline items={c.history} />
        </>
      ) : null}
    </>
  );
};

export { DEPARTMENTS };
