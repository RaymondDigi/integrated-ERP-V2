import React, { useMemo, useState } from 'react';
import { Gavel } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../payroll/shared';
import { CATEGORY_LABEL, SANCTION_LABEL, suggestSanction, type CaseCategory } from '../../../data/discipline';
import { fmtDate } from '../../../data/timeEngine';

/** Raise a disciplinary case, optionally from attendance days. */
export const NewCaseModal: React.FC<{
  staffId?: string;
  category?: CaseCategory;
  dates?: string[];
  summary?: string;
  onClose: () => void;
  onRaised?: (id: string) => void;
}> = ({ staffId: initialStaff, category: initialCat, dates = [], summary: initialSummary, onClose, onRaised }) => {
  const { hrEmployees, selectedOrgId, raiseCase, disciplinaryCases, timeToday } = useApp();
  const staff = useMemo(() => hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName)), [hrEmployees, selectedOrgId]);
  const [staffId, setStaffId] = useState(initialStaff ?? staff[0]?.staffId ?? '');
  const [category, setCategory] = useState<CaseCategory>(initialCat ?? 'MISCONDUCT');
  const [picked, setPicked] = useState<string[]>(dates);
  const [incident, setIncident] = useState(dates.length ? dates[dates.length - 1] : timeToday);
  const [summary, setSummary] = useState(initialSummary ?? '');
  const hint = suggestSanction(disciplinaryCases, staffId, category, timeToday);
  const open = disciplinaryCases.filter((c) => c.staffId === staffId && c.stage !== 'CLOSED');
  const fromAttendance = dates.length > 0;

  const submit = () => {
    if (!staffId || !summary.trim()) return;
    const c = raiseCase({ staffId, category, summary, incidentDate: incident, absenceDates: fromAttendance ? picked : undefined });
    onRaised?.(c.id);
    onClose();
  };

  return (
    <Modal
      title="Raise a disciplinary case"
      subtitle="Employment Act s.41: the employee is told the reason in a language they understand and may have a representative of choice at the hearing."
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!summary.trim() || (fromAttendance && !picked.length)} onClick={submit}>
            <Gavel size={14} /> Raise case
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Employee</span>
          <select className="form-control" value={staffId} disabled={!!initialStaff} onChange={(ev) => setStaffId(ev.target.value)}>
            {staff.map((e) => (
              <option key={e.staffId} value={e.staffId}>
                {e.fullName} · {e.staffId}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Category</span>
          <select className="form-control" value={category} onChange={(ev) => setCategory(ev.target.value as CaseCategory)}>
            {(Object.keys(CATEGORY_LABEL) as CaseCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Incident date</span>
          <input className="form-control" type="date" max={timeToday} value={incident} onChange={(ev) => setIncident(ev.target.value)} />
        </label>
        <div className="req-field">
          <span>Suggested sanction if proved</span>
          <div className="pr-note" style={{ padding: '8px 10px' }}>
            <strong>{SANCTION_LABEL[hint.sanction]}</strong>
            <div className="pr-muted">{hint.reason}</div>
          </div>
        </div>
        {fromAttendance && (
          <div className="req-field wide">
            <span>Attendance days in this case</span>
            <div className="tm-checks">
              {dates.map((d) => (
                <label key={d}>
                  <input type="checkbox" checked={picked.includes(d)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, d].sort() : picked.filter((x) => x !== d))} /> {fmtDate(d, true)}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="req-field wide">
          <span>What happened</span>
          <textarea className="form-control" rows={3} value={summary} onChange={(ev) => setSummary(ev.target.value)} placeholder="Facts only: dates, times, what was seen or recorded, who reported it." />
        </label>
      </div>
      {open.length > 0 && (
        <div className="pr-note warn">
          {open.length} open case{open.length > 1 ? 's' : ''} for this employee already: {open.map((c) => c.id).join(', ')}.
        </div>
      )}
    </Modal>
  );
};
