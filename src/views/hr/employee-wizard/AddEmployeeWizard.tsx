import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight, UserPlus, AlertCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { STEPS, emptyForm, nextStaffId, validateStep, blockingErrors, buildEmployee, type EmployeeForm, type StepId } from './wizardModel';
import { PersonalStep, PlacementStep, ContractStep, PaymentStep, AdditionalStep, ReviewStep } from './WizardSteps';

export const AddEmployeeWizard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { hrEmployees, orgStructure, customFields, addHrEmployee, activeTenantSettings: co } = useApp();
  // New employees start with the active company's rules
  const companyDefaults = {
    probationMonths: String(co.probation.defaultMonths),
    retirementAge: String(co.retirement.normalAge),
    leaveAnnualDays: String(co.leave.annualDays)
  };
  const [form, setForm] = useState<EmployeeForm>(() => ({ ...emptyForm(nextStaffId(hrEmployees)), ...companyDefaults }));
  const [stepIdx, setStepIdx] = useState(0);
  const [reached, setReached] = useState(0);
  const [tried, setTried] = useState<Partial<Record<StepId, boolean>>>({});
  const [addAnother, setAddAnother] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const step = STEPS[stepIdx];
  const vctx = { contractTypes: CONTRACT_TYPES, customFields, employees: hrEmployees };
  const errors = useMemo(() => validateStep(step.id, form, vctx), [step.id, form, customFields, hrEmployees]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepValid = (id: StepId) => blockingErrors(validateStep(id, form, vctx)).length === 0;
  const dirty = !!(form.firstName || form.lastName || form.nationalId || form.phone);

  const set = (patch: Partial<EmployeeForm>) => setForm((f) => ({ ...f, ...patch }));

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
    const n = Math.min(STEPS.length - 1, stepIdx + 1);
    setStepIdx(n);
    setReached((r) => Math.max(r, n));
  };

  const goTo = (id: StepId) => {
    const i = STEPS.findIndex((s) => s.id === id);
    if (i <= reached) setStepIdx(i);
  };

  const create = () => {
    const firstBad = STEPS.slice(0, -1).find((s) => !stepValid(s.id));
    if (firstBad) {
      setTried((t) => ({ ...t, [firstBad.id]: true }));
      goTo(firstBad.id);
      return;
    }
    addHrEmployee(buildEmployee(form, orgStructure, CONTRACT_TYPES));
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

  const showErrors = !!tried[step.id];
  const errorCount = showErrors ? blockingErrors(errors).length : 0;

  return (
    <div className="ew-overlay" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className="ew-modal" role="dialog" aria-modal="true" aria-labelledby="ew-title">
        {/* Stepper */}
        <aside className="ew-stepper">
          <div className="ew-stepper-head">
            <span className="ew-stepper-icon">
              <UserPlus size={18} />
            </span>
            <div>
              <h2 id="ew-title">New employee</h2>
              <span>
                Step {stepIdx + 1} of {STEPS.length}
              </span>
            </div>
          </div>
          <ol>
            {STEPS.map((s, i) => {
              const done = i < reached || (i < stepIdx);
              const state = i === stepIdx ? 'current' : done && stepValid(s.id) ? 'done' : done ? 'warn' : i <= reached ? 'open' : 'todo';
              return (
                <li key={s.id} className={`ew-step ${state}`}>
                  <button type="button" disabled={i > reached} onClick={() => goTo(s.id)} aria-current={i === stepIdx ? 'step' : undefined}>
                    <span className="ew-step-dot">{state === 'done' ? <Check size={13} /> : state === 'warn' ? '!' : i + 1}</span>
                    <span className="ew-step-text">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="ew-progress" aria-hidden="true">
            <span style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} />
          </div>
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
            {step.id === 'personal' && <PersonalStep form={form} set={set} errors={errors} showErrors={showErrors} />}
            {step.id === 'placement' && <PlacementStep form={form} set={set} errors={errors} showErrors={showErrors} />}
            {step.id === 'contract' && <ContractStep form={form} set={set} errors={errors} showErrors={showErrors} />}
            {step.id === 'payment' && <PaymentStep form={form} set={set} errors={errors} showErrors={showErrors} />}
            {step.id === 'additional' && <AdditionalStep form={form} set={set} errors={errors} showErrors={showErrors} />}
            {step.id === 'review' && <ReviewStep form={form} goTo={goTo} />}
          </div>

          <footer className="ew-footer">
            {confirmClose ? (
              <div className="ew-confirm">
                <span>Discard this new employee? Your entries will be lost.</span>
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
                  <>
                    <label className="ew-check">
                      <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
                      <span>Add another after this</span>
                    </label>
                    <button type="button" className="btn btn-primary" onClick={create}>
                      <UserPlus size={15} /> Create employee
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={next}>
                    Continue <ChevronRight size={15} />
                  </button>
                )}
              </>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
};
