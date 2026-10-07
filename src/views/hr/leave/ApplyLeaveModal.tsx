import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { supervisorFor, hrApproverFor, type LeaveCode } from '../../../data/leaveConfig';
import { eligibleCodes, leaveName, todayIso, typeAt, validateLeaveRequest, addDays } from '../../../data/leaveEngine';
import { Field, Figure, Messages, Modal, fmtDays, fmtNum } from './shared';

type Submitter = 'EMPLOYEE' | 'SUPERVISOR' | 'HR';

export const ApplyLeaveModal: React.FC<{ onClose: () => void; staffId?: string }> = ({ onClose, staffId }) => {
  const { tenantEmployees, hrEmployees, leaveRequests, leaveCfg, createLeaveRequest } = useApp();
  const staff = useMemo(
    () => tenantEmployees.filter((e) => e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [tenantEmployees]
  );
  const today = todayIso();
  const [empId, setEmpId] = useState(staffId ?? staff[0]?.staffId ?? '');
  const employee = staff.find((e) => e.staffId === empId);
  const codes = useMemo(() => (employee ? eligibleCodes(employee, today, leaveCfg) : []), [employee, today, leaveCfg]);
  const [code, setCode] = useState<LeaveCode>('AL');
  const activeCode: LeaveCode = codes.includes(code) ? code : codes[0] ?? 'AL';
  const [startDate, setStartDate] = useState(addDays(today, 14));
  const [endDate, setEndDate] = useState(addDays(today, 18));
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(false);
  const [submittedBy, setSubmittedBy] = useState<Submitter>('HR');

  const type = typeAt(activeCode, startDate || today, leaveCfg);
  const canHalf = type.allowHalfDay && startDate === endDate;
  const v = useMemo(
    () =>
      employee
        ? validateLeaveRequest(employee, { code: activeCode, startDate, endDate, halfDay: canHalf && halfDay, attachment, submittedBy }, leaveRequests, leaveCfg)
        : null,
    [employee, activeCode, startDate, endDate, halfDay, canHalf, attachment, submittedBy, leaveRequests, leaveCfg]
  );
  const sup = employee ? supervisorFor(employee, hrEmployees) : undefined;
  const hr = employee ? hrApproverFor(employee.orgId, hrEmployees) : undefined;
  const ok = !!v?.ok && reason.trim().length > 0;

  const submit = () => {
    if (!employee || !ok) return;
    const created = createLeaveRequest({
      staffId: employee.staffId,
      staffName: employee.fullName,
      leaveType: leaveName(activeCode, leaveCfg),
      startDate,
      endDate,
      daysCount: v?.days ?? 0,
      halfDay: canHalf && halfDay,
      reason: reason.trim(),
      attachment,
      submittedBy
    });
    if (created) onClose();
  };

  return (
    <Modal
      title="Apply for leave"
      subtitle="The leave engine checks eligibility, balance, notice and overlaps as you type."
      onClose={onClose}
      footer={
        <>
          <span className="lv-muted" style={{ marginRight: 'auto' }}>
            {v?.ok && !reason.trim() ? 'Add a reason to submit.' : v && !v.ok ? 'Fix the issues above to submit.' : 'Days are reserved as soon as it is submitted.'}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!ok}>
            Submit request
          </button>
        </>
      }
    >
      <div className="lv-form-grid">
        <Field label="Employee" className="lv-span-2">
          <select className="form-control" value={empId} onChange={(e) => setEmpId(e.target.value)}>
            {staff.map((e) => (
              <option key={e.staffId} value={e.staffId}>
                {e.fullName} · {e.staffId} · {e.department}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Leave type" hint={employee ? `${codes.length} types this employee is eligible for (gender and contract).` : undefined}>
          <select className="form-control" value={activeCode} onChange={(e) => setCode(e.target.value as LeaveCode)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {leaveName(c, leaveCfg)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Submitted by" hint="Backdated leave can be submitted by a supervisor or HR only.">
          <select className="form-control" value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value as Submitter)}>
            <option value="EMPLOYEE">Employee (self-service)</option>
            <option value="SUPERVISOR">Supervisor on their behalf</option>
            <option value="HR">HR on their behalf</option>
          </select>
        </Field>
        <Field label="Start date">
          <input
            type="date"
            className="form-control"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
            }}
          />
        </Field>
        <Field label="End date">
          <input type="date" className="form-control" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <div className="lv-span-2" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <label className="lv-check" title={type.allowHalfDay ? 'Start and end on the same day' : `${type.name} cannot be taken as a half day`}>
            <input type="checkbox" checked={canHalf && halfDay} disabled={!canHalf} onChange={(e) => setHalfDay(e.target.checked)} />
            Half day
          </label>
          <label className="lv-check">
            <input type="checkbox" checked={attachment} onChange={(e) => setAttachment(e.target.checked)} />
            Supporting document attached
            {type.attachmentAfterDays !== null && (
              <span className="lv-muted">
                (needed {type.attachmentAfterDays === 0 ? 'always' : `over ${type.attachmentAfterDays} days`})
              </span>
            )}
          </label>
        </div>
        <Field label="Reason" className="lv-span-2">
          <textarea className="form-control" rows={2} value={reason} placeholder="e.g. Family visit upcountry; handover to Mary" onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>

      {v && (
        <div className="lv-figures">
          <Figure label={type.countBasis === 'Calendar days' ? 'Calendar days' : 'Working days'} value={fmtNum(v.days)} sub={type.countBasis === 'Working days' ? 'Weekends and holidays skipped' : 'Every day counts'} />
          <Figure label="Available now" value={v.available === null ? 'Not tracked' : fmtNum(v.available)} sub={type.isPaid ? 'From the ledger' : 'Unpaid leave'} />
          <Figure
            label="After this request"
            value={v.balanceAfter === null ? '—' : fmtNum(v.balanceAfter)}
            tone={v.balanceAfter !== null && v.balanceAfter < 0 ? 'bad' : undefined}
          />
          <Figure
            label="Approval"
            value={v.workflow.length === 2 ? '2 steps' : '1 step'}
            sub={v.workflow.map((s) => (s === 'SUPERVISOR' ? sup?.fullName ?? 'Supervisor' : `HR (${hr?.fullName ?? 'HR office'})`)).join(' → ')}
          />
        </div>
      )}

      {v && (
        <Messages
          errors={v.errors}
          warnings={v.warnings}
          info={[`${type.name} v${type.version}: notice ${fmtDays(type.minNoticeDays)}, ${fmtNum(type.minDays)}–${fmtNum(type.maxDays)} days per request.`]}
          ok={v.ok ? `Valid: ${fmtDays(v.days)} of ${type.name.toLowerCase()}.` : undefined}
        />
      )}
    </Modal>
  );
};
