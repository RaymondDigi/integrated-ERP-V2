import React, { useMemo, useState } from 'react';
import { Plus, AlertCircle, Trash2, Copy, X, FileText, ChevronDown } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { EmployeeRequisition, RequisitionLine } from '../../../types';
import { GRADE_SCALES } from '../../../data/orgData';
import { REQ_STEP_LABEL } from '../../../data/hireConfig';
import { bandOf, budgetCheck, establishmentRows, kes, shortGrade } from '../../../data/hireEngine';
import { JobDescriptionPanel, cleanJobDescription, jobDescriptionProgress } from '../../../components/forms/JobDescriptionPanel';
import type { RequisitionDraft } from '../../../context/hireState';

const newLine = (seed?: Partial<RequisitionLine>): RequisitionLine => ({
  id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  gradeScale: 'JG-08 (Technical Specialist)',
  headcount: 1,
  monthlySalaryKes: 68000,
  neededBy: '',
  ...seed
});

const REASONS: RequisitionDraft['vacancyReason'][] = ['New position', 'Replacement', 'Expansion', 'Seasonal'];

/** Create or edit a requisition; the budget and establishment check updates as lines change. */
export const RequisitionForm: React.FC<{ onClose: () => void; editing?: EmployeeRequisition }> = ({ onClose, editing }) => {
  const { tenantEmployees, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans, selectedOrgId, orgStructure, activeTenant, saveRequisition } = useApp();
  const staff = tenantEmployees.filter((e) => e.status !== 'TERMINATED');
  const branchName = staff[0]?.branch ?? activeTenant.name;
  const depts = [...new Set([...orgStructure.departments.map((d) => d.name), ...staff.map((e) => e.department)])];

  const [department, setDepartment] = useState(editing?.department ?? 'Operations');
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Urgent'>(editing?.priority ?? 'Normal');
  const [justification, setJustification] = useState(editing?.justification ?? '');
  const [requester, setRequester] = useState(editing?.requesterStaffId ?? staff.find((e) => /operations manager/i.test(e.jobTitle))?.staffId ?? '');
  const [reason, setReason] = useState<RequisitionDraft['vacancyReason']>(editing?.vacancyReason ?? 'New position');
  const [replacing, setReplacing] = useState(editing?.replacingStaffId ?? '');
  const [lines, setLines] = useState<RequisitionLine[]>(() => (editing?.lines?.length ? editing.lines.map((l) => ({ ...l })) : [newLine()]));
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const updateLine = (id: string, patch: Partial<RequisitionLine>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const duplicateLine = (id: string) =>
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      const { id: _omit, ...rest } = prev[idx];
      const copy = newLine({ ...rest, jobDescription: rest.jobDescription && { ...rest.jobDescription, responsibilities: [...rest.jobDescription.responsibilities], skills: [...rest.jobDescription.skills] } });
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });

  const headcount = lines.reduce((n, l) => n + (Number(l.headcount) || 0), 0);
  const monthly = lines.reduce((n, l) => n + (Number(l.headcount) || 0) * (Number(l.monthlySalaryKes) || 0), 0);
  const rows = useMemo(
    () => establishmentRows(selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans),
    [selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans]
  );
  const check = budgetCheck({ department, headcountRequired: headcount, lines, estimatedBudgetKes: monthly, status: 'DRAFT' }, rows);
  const invalid = lines.filter((l) => !l.title.trim() || l.headcount < 1);

  const save = (submit: boolean) => {
    setSubmitted(true);
    if (invalid.length || !justification.trim() || !requester) return;
    const created = saveRequisition(
      {
        title: '',
        department,
        branch: branchName,
        priority,
        justification,
        lines: lines.map((l) => ({ ...l, jobDescription: cleanJobDescription(l.jobDescription) })),
        requesterStaffId: requester,
        vacancyReason: reason,
        replacingStaffId: replacing || undefined
      },
      submit,
      editing?.id
    );
    if (created) onClose();
  };

  return (
    <div className="req-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="req-modal" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="req-modal-header">
          <div>
            <h2>{editing ? `Edit ${editing.requisitionNo}` : 'Employee requisition'}</h2>
            <p>One or more positions for a department. Open JD on a line to add job description details; the advert is drafted from it.</p>
          </div>
          <button type="button" className="req-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="req-modal-body">
          <section className="req-section">
            <div className="req-section-title">Requisition details</div>
            <div className="req-header-grid">
              <label className="req-field">
                <span>Department</span>
                <select className="form-control" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {depts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>Requested by</span>
                <select className={`form-control ${submitted && !requester ? 'is-invalid' : ''}`} value={requester} onChange={(e) => setRequester(e.target.value)}>
                  <option value="">Choose…</option>
                  {staff
                    .filter((e) => e.basicSalaryKes >= 60_000)
                    .map((e) => (
                      <option key={e.staffId} value={e.staffId}>
                        {e.fullName} — {e.jobTitle}
                      </option>
                    ))}
                </select>
              </label>
              <label className="req-field">
                <span>Reason</span>
                <select className="form-control" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                  {REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {reason === 'Replacement' ? (
                <label className="req-field">
                  <span>Replacing</span>
                  <select className="form-control" value={replacing} onChange={(e) => setReplacing(e.target.value)}>
                    <option value="">Choose…</option>
                    {tenantEmployees
                      .filter((e) => e.department === department)
                      .map((e) => (
                        <option key={e.staffId} value={e.staffId}>
                          {e.fullName} ({e.status === 'TERMINATED' || e.exitDate ? 'leaving' : e.jobTitle})
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label className="req-field">
                  <span>Priority</span>
                  <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="req-section">
            <div className="req-section-title">
              Positions <span className="req-count">{lines.length}</span>
            </div>
            <div className="req-lines">
              <div className="req-line req-line-head" aria-hidden="true">
                <span>#</span>
                <span>Position title</span>
                <span>Grade</span>
                <span>Qty</span>
                <span>Basic / head (KES)</span>
                <span>Needed by</span>
                <span className="req-num">Monthly basic</span>
                <span />
              </div>
              {lines.map((line, idx) => {
                const open = expanded.has(line.id);
                const progress = jobDescriptionProgress(line.jobDescription);
                const band = bandOf(line.gradeScale);
                const daily = line.monthlySalaryKes > 0 && line.monthlySalaryKes < 5_000;
                const outOfBand = !daily && band && (line.monthlySalaryKes < band.min || line.monthlySalaryKes > band.max);
                return (
                  <div className={`req-line-group ${open ? 'is-open' : ''}`} key={line.id}>
                    <div className="req-line">
                      <span className="req-line-no">{idx + 1}</span>
                      <label className="req-cell" data-label="Position title">
                        <input className={`form-control ${submitted && !line.title.trim() ? 'is-invalid' : ''}`} placeholder="e.g. Team Supervisor" value={line.title} onChange={(e) => updateLine(line.id, { title: e.target.value })} />
                      </label>
                      <label className="req-cell" data-label="Grade">
                        <select className="form-control" value={line.gradeScale} onChange={(e) => updateLine(line.id, { gradeScale: e.target.value, monthlySalaryKes: bandOf(e.target.value)?.mid ?? line.monthlySalaryKes })}>
                          {GRADE_SCALES.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </label>
                      <label className="req-cell" data-label="Qty">
                        <input className={`form-control ${submitted && line.headcount < 1 ? 'is-invalid' : ''}`} type="number" min={1} max={50} value={line.headcount} onChange={(e) => updateLine(line.id, { headcount: Math.max(0, Number(e.target.value)) })} />
                      </label>
                      <label className="req-cell" data-label="Basic / head (KES)">
                        <input
                          className={`form-control ${outOfBand ? 'is-invalid' : ''}`}
                          type="number"
                          min={0}
                          step={1000}
                          value={line.monthlySalaryKes}
                          title={band ? `${shortGrade(line.gradeScale)} band: KES ${band.min.toLocaleString()}–${band.max.toLocaleString()}. Enter a daily rate (below 5,000) for daily-rated roles.` : undefined}
                          onChange={(e) => updateLine(line.id, { monthlySalaryKes: Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                      <label className="req-cell" data-label="Needed by">
                        <input className="form-control" type="date" value={line.neededBy} onChange={(e) => updateLine(line.id, { neededBy: e.target.value })} />
                      </label>
                      <span className="req-cell req-num req-line-total" data-label="Monthly basic">
                        {daily ? `${line.monthlySalaryKes}/day` : (line.headcount * line.monthlySalaryKes).toLocaleString()}
                      </span>
                      <span className="req-line-actions">
                        <button type="button" className={`req-jd-toggle ${open ? 'active' : ''} ${progress.done === progress.total ? 'complete' : ''}`} onClick={() => toggle(line.id)} aria-expanded={open} title="Job description details">
                          <FileText size={13} />
                          <span>
                            {progress.done}/{progress.total}
                          </span>
                          <ChevronDown size={13} className="req-jd-chevron" />
                        </button>
                        <button type="button" className="req-icon-btn" onClick={() => duplicateLine(line.id)} title="Duplicate line" aria-label={`Duplicate line ${idx + 1}`}>
                          <Copy size={14} />
                        </button>
                        <button type="button" className="req-icon-btn danger" onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== line.id) : prev))} disabled={lines.length === 1} title="Remove line" aria-label={`Remove line ${idx + 1}`}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>
                    {outOfBand && band && (
                      <div className="hi-line-note">
                        {shortGrade(line.gradeScale)} band is KES {band.min.toLocaleString()}–{band.max.toLocaleString()}. Offers outside it need approval.
                      </div>
                    )}
                    {open && <JobDescriptionPanel value={line.jobDescription} positionTitle={line.title} onChange={(jd) => updateLine(line.id, { jobDescription: jd })} />}
                  </div>
                );
              })}
            </div>
            <button type="button" className="req-add-line" onClick={() => setLines((prev) => [...prev, newLine()])}>
              <Plus size={14} /> Add position line
            </button>
          </section>

          <section className="req-section">
            <div className="req-section-title">Budget and establishment check</div>
            <div className="pr-kv">
              <div>
                <span>Annual cost</span>
                <strong>{kes(check.annualCost)}</strong>
                <small>Basic, allowances, employer NSSF, housing levy and NITA × 12</small>
              </div>
              <div>
                <span>Establishment</span>
                <strong>
                  {check.row ? `${check.row.inPost + check.row.joining + check.row.open} / ${check.row.approved}` : 'No plan'}
                </strong>
                <small>{check.row ? `${check.row.inPost} in post, ${check.row.joining} joining, ${check.row.open} open; ${Math.max(0, check.row.vacant)} free` : 'This department has no approved positions'}</small>
              </div>
              <div>
                <span>Budget headroom after</span>
                <strong className={check.overBudget ? 'hi-neg' : ''}>{kes(check.headroomAfter)}</strong>
                <small>Annual budget {kes(check.row?.budgetKes ?? 0)}</small>
              </div>
              <div>
                <span>Approval path</span>
                <strong style={{ fontSize: 13 }}>{check.steps.map((s) => REQ_STEP_LABEL[s]).join(' → ')}</strong>
                <small>{check.overEstablishment ? `${check.excessPositions} above establishment` : check.overBudget ? 'Over budget' : 'Within plan'}</small>
              </div>
            </div>
          </section>

          <section className="req-section">
            <label className="req-field">
              <span>Justification *</span>
              <textarea
                className={`form-control ${submitted && !justification.trim() ? 'is-invalid' : ''}`}
                rows={3}
                placeholder="Why the positions are needed: workload, demand, statutory requirement or the person being replaced."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            </label>
          </section>
        </div>

        <div className="req-modal-footer">
          <div className="req-totals">
            <div>
              <span>Total headcount</span>
              <strong className={check.overEstablishment ? 'req-over' : ''}>{headcount}</strong>
            </div>
            <div>
              <span>Monthly basic</span>
              <strong>KES {monthly.toLocaleString()}</strong>
            </div>
          </div>
          {submitted && (invalid.length > 0 || !justification.trim() || !requester) && (
            <div className="req-error">
              <AlertCircle size={14} />
              {invalid.length ? `Complete line ${lines.indexOf(invalid[0]) + 1}: a title and a quantity of at least 1.` : !requester ? 'Choose who is requesting.' : 'Justification is required.'}
            </div>
          )}
          <div className="req-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={() => save(false)}>
              Save draft
            </button>
            <button type="button" className="btn btn-primary" onClick={() => save(true)}>
              Submit for approval
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
