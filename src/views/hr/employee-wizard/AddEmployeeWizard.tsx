import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight, UserPlus, AlertCircle, UserPen, Save, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { hrOfficer, todayIso } from '../../../data/hireEngine';
import type { ChangeKind } from '../../../data/hireConfig';
import type { HREmployee } from '../../../types';
import { useApprovers } from '../hire/shared';
import { STEPS, emptyForm, nextStaffId, validateStep, blockingErrors, buildEmployee, type EmployeeForm, type StepId } from './wizardModel';
import { PersonalStep, PlacementStep, ContractStep, PaymentStep, AdditionalStep, ReviewStep, type EditCtx } from './WizardSteps';
import { diffEmployee, formFromEmployee } from './employeeEdit';
import { EditReviewStep } from './EditReviewStep';

interface Props {
  onClose: () => void;
  /** Edit this employee in the same screens used to add one */
  employee?: HREmployee;
  unmask?: boolean;
  /** Job, pay and contract changes hand over to the approved change requests */
  onRequestChange?: (k: ChangeKind) => void;
}

const EDIT_STEPS = STEPS.map((s) => (s.id === 'review' ? { ...s, label: 'Review & save', hint: 'Check the changes and confirm' } : s));

export const AddEmployeeWizard: React.FC<Props> = ({ onClose, employee, unmask: unmaskInitial = false, onRequestChange }) => {
  const { hrEmployees, orgStructure, customFields, addHrEmployee, updateHrEmployee, logEmployeeEdit, addToast, payrollOpenPeriod, activeTenantSettings: co } = useApp();
  const editing = !!employee;
  const steps = editing ? EDIT_STEPS : STEPS;
  // New employees start with the active company's rules
  const companyDefaults = {
    probationMonths: String(co.probation.defaultMonths),
    retirementAge: String(co.retirement.normalAge),
    leaveAnnualDays: String(co.leave.annualDays)
  };
  // Editing: the record as loaded, kept to work out what changed
  const initial = useMemo(
    () => (employee ? formFromEmployee(employee, orgStructure, hrEmployees, payrollOpenPeriod) : { ...emptyForm(nextStaffId(hrEmployees)), ...companyDefaults }),
    // Loaded once when the wizard opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [form, setForm] = useState<EmployeeForm>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  // Every step of an existing record can be opened straight away
  const [reached, setReached] = useState(editing ? STEPS.length - 1 : 0);
  const [tried, setTried] = useState<Partial<Record<StepId, boolean>>>({});
  const [addAnother, setAddAnother] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [unmask, setUnmask] = useState(unmaskInitial);
  const [reason, setReason] = useState('');

  // Who records an edit: HR staff of the company, defaulting to its HR officer
  const approvers = useApprovers();
  const hrPeople = useMemo(() => {
    const others = approvers.filter((p) => p.staffId !== employee?.staffId);
    const hrOnly = others.filter((p) => /\bHR\b|human resource/i.test(p.jobTitle));
    return hrOnly.length ? hrOnly : others;
  }, [approvers, employee?.staffId]);
  const officer = employee ? hrOfficer(employee.orgId, hrEmployees) : undefined;
  const [actor, setActor] = useState((hrPeople.find((p) => p.staffId === officer?.staffId) ?? hrPeople[0])?.staffId ?? '');

  const step = steps[stepIdx];
  const vctx = { contractTypes: CONTRACT_TYPES, customFields, employees: hrEmployees, editing: employee, initial };
  const errors = useMemo(() => validateStep(step.id, form, vctx), [step.id, form, customFields, hrEmployees]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepValid = (id: StepId) => blockingErrors(validateStep(id, form, vctx)).length === 0;
  const diff = useMemo(() => (employee ? diffEmployee(employee, initial, form, { org: orgStructure, employees: hrEmployees, customFields }) : null), [employee, initial, form, orgStructure, hrEmployees, customFields]);
  const dirty = editing ? !!diff?.changes.length : !!(form.firstName || form.lastName || form.nationalId || form.phone);

  const set = (patch: Partial<EmployeeForm>) => setForm((f) => ({ ...f, ...patch }));
  const editCtx: EditCtx | undefined = employee
    ? {
        e: employee,
        unmask,
        onRequestChange: (k) => {
          if (diff?.changes.length) addToast({ type: 'info', title: 'Unsaved edits discarded', message: 'Save your edits first if you need them, then raise the request.' });
          onRequestChange?.(k);
        }
      }
    : undefined;

  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const next = () => {
    setTried((t) => ({ ...t, [step.id]: true }));
    if (blockingErrors(errors).length) {
      document.querySelector('.ew-body')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const n = Math.min(steps.length - 1, stepIdx + 1);
    setStepIdx(n);
    setReached((r) => Math.max(r, n));
  };

  const goTo = (id: StepId) => {
    const i = steps.findIndex((s) => s.id === id);
    if (i <= reached) setStepIdx(i);
  };

  /** First step with blocking errors, opened with its errors showing. */
  const firstInvalid = () => {
    const bad = steps.slice(0, -1).find((s) => !stepValid(s.id));
    if (bad) {
      setTried((t) => ({ ...t, [bad.id]: true }));
      goTo(bad.id);
    }
    return bad;
  };

  const create = () => {
    if (firstInvalid()) return;
    addHrEmployee(buildEmployee(form, orgStructure, CONTRACT_TYPES, hrEmployees));
    if (addAnother) {
      // Keep placement & contract choices to speed up batch onboarding
      const keep = {
        branchId: form.branchId,
        stationId: form.stationId,
        departmentId: form.departmentId,
        sectionId: form.sectionId,
        designationId: form.designationId,
        reportsToStaffId: form.reportsToStaffId,
        contractType: form.contractType,
        startDate: form.startDate,
        endDate: form.endDate,
        probationMonths: form.probationMonths,
        noticeDays: form.noticeDays,
        workSchedule: form.workSchedule,
        retirementAge: form.retirementAge,
        leaveAnnualDays: form.leaveAnnualDays,
        leaveAccrual: form.leaveAccrual,
        leaveDuringProbation: form.leaveDuringProbation
      };
      const bumped = form.staffId.replace(/(\d+)$/, (m) => String(Number(m) + 1).padStart(m.length, '0'));
      setForm({ ...emptyForm(bumped), ...companyDefaults, ...keep });
      setStepIdx(0);
      setReached(0);
      setTried({});
    } else {
      onClose();
    }
  };

  const save = () => {
    if (!employee || !diff) return;
    if (firstInvalid()) return;
    setTried((t) => ({ ...t, review: true }));
    if (!diff.changes.length) {
      addToast({ type: 'info', title: 'Nothing changed', message: `${employee.fullName}'s record is unchanged.` });
      return;
    }
    if (diff.sensitive.length && reason.trim().length < 5) return;
    if (!actor) return;
    const by = hrEmployees.find((x) => x.staffId === actor)?.fullName ?? 'HR office';
    const why = reason.trim();
    const labels = diff.changes.map((c) => c.label).join(', ');
    updateHrEmployee(employee.staffId, { ...diff.patch, history: [...(employee.history ?? []), { date: todayIso(), kind: 'Details updated', summary: `Changed ${labels}${why ? ` — ${why}` : ''}`, by }] });
    logEmployeeEdit(
      employee.staffId,
      [{ action: `Details updated: ${labels}` }, ...diff.sensitive.map((c) => ({ action: `${c.label}: ${c.from} → ${c.to}${why ? ` (reason: ${why})` : ''}`, sensitive: true }))],
      by
    );
    const payroll = diff.sensitive.some((c) => /bank|M-Pesa|pay rail|tax|statutory/.test(c.label));
    addToast({ type: 'success', title: 'Details saved', message: `${diff.patch.fullName ?? employee.fullName}: ${labels} updated.${payroll ? ` Payroll uses the new details from ${payrollOpenPeriod.label}.` : ''}` });
    onClose();
  };

  /** Editing: save from any step once every step is valid. */
  const reviewAndSave = () => {
    if (firstInvalid()) return;
    setStepIdx(steps.length - 1);
  };

  const showErrors = !!tried[step.id];
  const errorCount = showErrors ? blockingErrors(errors).length : 0;
  const changeCount = diff?.changes.length ?? 0;

  return (
    <div className="ew-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="ew-modal" role="dialog" aria-modal="true" aria-labelledby="ew-title">
        {/* Stepper */}
        <aside className="ew-stepper">
          <div className="ew-stepper-head">
            <span className="ew-stepper-icon">{editing ? <UserPen size={18} /> : <UserPlus size={18} />}</span>
            <div>
              <h2 id="ew-title">{employee ? `Edit ${employee.fullName}` : 'New employee'}</h2>
              <span>
                {employee ? `${employee.staffId} · ` : ''}Step {stepIdx + 1} of {steps.length}
              </span>
            </div>
          </div>
          <ol>
            {steps.map((s, i) => {
              const done = editing ? i !== stepIdx : i < reached || i < stepIdx;
              const valid = s.id === 'review' || stepValid(s.id);
              const state = i === stepIdx ? 'current' : done && valid ? 'done' : done ? 'warn' : i <= reached ? 'open' : 'todo';
              return (
                <li key={s.id} className={`ew-step ${state}`}>
                  <button type="button" disabled={i > reached} onClick={() => goTo(s.id)} aria-current={i === stepIdx ? 'step' : undefined}>
                    <span className="ew-step-dot">{state === 'done' && !editing ? <Check size={13} /> : state === 'warn' ? '!' : i + 1}</span>
                    <span className="ew-step-text">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {editing ? (
            <div className="ew-edit-summary">
              <span>{changeCount ? `${changeCount} change${changeCount > 1 ? 's' : ''}${diff?.sensitive.length ? ` · ${diff.sensitive.length} sensitive` : ''}` : 'No changes yet'}</span>
              <button type="button" className="ew-link" onClick={() => setUnmask((x) => !x)}>
                {unmask ? <EyeOff size={13} /> : <Eye size={13} />} {unmask ? 'Mask numbers' : 'Reveal numbers'}
              </button>
            </div>
          ) : (
            <div className="ew-progress" aria-hidden="true">
              <span style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
            </div>
          )}
        </aside>

        {/* Content */}
        <section className="ew-content">
          <header className="ew-header">
            <div>
              <h3>{step.label}</h3>
              <span>{step.hint}</span>
            </div>
            <button type="button" className="req-icon-btn" onClick={requestClose} aria-label="Close">
              <X size={18} />
            </button>
          </header>

          <div className="ew-body" key={step.id}>
            {errorCount > 0 && (
              <div className="ew-error-banner" role="alert">
                <AlertCircle size={15} /> Fix {errorCount} field{errorCount === 1 ? '' : 's'} highlighted below to continue.
              </div>
            )}
            {step.id === 'personal' && <PersonalStep form={form} set={set} errors={errors} showErrors={showErrors} edit={editCtx} />}
            {step.id === 'placement' && <PlacementStep form={form} set={set} errors={errors} showErrors={showErrors} edit={editCtx} />}
            {step.id === 'contract' && <ContractStep form={form} set={set} errors={errors} showErrors={showErrors} edit={editCtx} />}
            {step.id === 'payment' && <PaymentStep form={form} set={set} errors={errors} showErrors={showErrors} edit={editCtx} />}
            {step.id === 'additional' && <AdditionalStep form={form} set={set} errors={errors} showErrors={showErrors} edit={editCtx} />}
            {step.id === 'review' &&
              (diff ? (
                <EditReviewStep
                  changes={diff.changes}
                  reason={reason}
                  setReason={setReason}
                  actor={actor}
                  setActor={setActor}
                  people={hrPeople}
                  showErrors={!!tried.review}
                  goTo={goTo}
                  payrollFrom={payrollOpenPeriod.label}
                />
              ) : (
                <ReviewStep form={form} goTo={goTo} />
              ))}
          </div>

          <footer className="ew-footer">
            {confirmClose ? (
              <div className="ew-confirm">
                <span>{editing ? `Discard ${changeCount} unsaved change${changeCount === 1 ? '' : 's'}?` : 'Discard this new employee? Your entries will be lost.'}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClose(false)}>
                  Keep editing
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={onClose}>
                  Discard
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}>
                  <ChevronLeft size={15} /> Back
                </button>
                <span className="ew-footer-spacer" />
                {step.id === 'review' ? (
                  editing ? (
                    <button type="button" className="btn btn-primary" onClick={save} disabled={!changeCount}>
                      <Save size={15} /> Save changes
                    </button>
                  ) : (
                    <>
                      <label className="ew-check">
                        <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
                        <span>Add another after this</span>
                      </label>
                      <button type="button" className="btn btn-primary" onClick={create}>
                        <UserPlus size={15} /> Create employee
                      </button>
                    </>
                  )
                ) : (
                  <>
                    {editing && changeCount > 0 && (
                      <button type="button" className="btn btn-secondary" onClick={reviewAndSave}>
                        <Save size={15} /> Review & save
                      </button>
                    )}
                    <button type="button" className="btn btn-primary" onClick={next}>
                      Continue <ChevronRight size={15} />
                    </button>
                  </>
                )}
              </>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
};
