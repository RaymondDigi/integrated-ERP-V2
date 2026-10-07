import React, { useMemo, useState } from 'react';
import { Search, Stethoscope } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { MEDICAL_RULES, SITES } from '../../../data/oshConfig';
import { medicalStatus, siteOf, type MedicalExam, type MedicalType } from '../../../data/oshEngine';
import type { HREmployee } from '../../../types';
import { Chips, EmpCell, Empty, fmt, Pill, useOshOrg } from './shared';

const STATE_CLS = { OVERDUE: 'critical', SOON: 'warning', OK: 'success', NA: 'primary' } as const;
const RESULT_LABEL: Record<MedicalExam['result'], string> = { FIT: 'Fit', FIT_RESTRICTED: 'Fit with restrictions', UNFIT: 'Unfit' };

export const MedicalTab: React.FC = () => {
  const { medicalExams, selectedOrgId } = useApp();
  const org = useOshOrg();
  const [filter, setFilter] = useState<'DUE' | 'ALL'>('DUE');
  const [type, setType] = useState<'ANY' | MedicalType>('ANY');
  const [q, setQ] = useState('');
  const [record, setRecord] = useState<{ e: HREmployee; type: MedicalType } | null>(null);
  const exams = useMemo(() => medicalExams.filter((m) => m.orgId === selectedOrgId), [medicalExams, selectedOrgId]);

  const all = useMemo(
    () =>
      org.staff.flatMap((e) =>
        medicalStatus(e, exams, org.today)
          .filter((s) => s.required)
          .map((s) => ({ e, ...s }))
      ),
    [org, exams]
  );
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((r) => (filter === 'ALL' ? true : r.state === 'OVERDUE' || r.state === 'SOON'))
      .filter((r) => type === 'ANY' || r.type === type)
      .filter((r) => !s || `${r.e.fullName} ${r.e.staffId} ${r.e.jobTitle}`.toLowerCase().includes(s))
      .sort((a, b) => (a.nextDue ?? '9').localeCompare(b.nextDue ?? '9'));
  }, [all, filter, type, q]);
  const pg = usePaged(rows, 10, `${filter}|${type}|${q}`);
  const count = (t: MedicalType) => all.filter((r) => r.type === t && r.state === 'OVERDUE').length;

  return (
    <>
      <div className="pr-kv osh-kv-gap">
        {(Object.keys(MEDICAL_RULES) as MedicalType[]).map((t) => (
          <div key={t}>
            <span>{MEDICAL_RULES[t].label}</span>
            <strong className={count(t) ? 'osh-bad' : ''}>{count(t)} overdue</strong>
            <small>
              {all.filter((r) => r.type === t).length} required · {MEDICAL_RULES[t].everyMonths ? `every ${MEDICAL_RULES[t].everyMonths} months` : 'on joining'}
            </small>
          </div>
        ))}
      </div>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Medical surveillance</h3>
            <p>Pre-employment medicals for new staff, food handler certificates every 6 months (factory, packing, lab), audiometry for noise-exposed roles and periodic medicals — by a DOSHS-designated health practitioner.</p>
          </div>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <Chips
            label="Medical filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'DUE', label: 'Due or overdue', n: all.filter((r) => r.state === 'OVERDUE' || r.state === 'SOON').length },
              { id: 'ALL', label: 'All', n: all.length }
            ]}
          />
          <select className="form-control" value={type} onChange={(ev) => setType(ev.target.value as typeof type)} aria-label="Medical type">
            <option value="ANY">All types</option>
            {(Object.keys(MEDICAL_RULES) as MedicalType[]).map((t) => (
              <option key={t} value={t}>
                {MEDICAL_RULES[t].label}
              </option>
            ))}
          </select>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search employee" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Medical</th>
                <th>Last</th>
                <th>Next due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={5}>Nothing due.</Empty>}
              {pg.rows.map((r) => (
                <tr key={`${r.e.staffId}-${r.type}`}>
                  <td>
                    <EmpCell e={r.e} id={r.e.staffId} sub={SITES[siteOf(r.e)].label} />
                  </td>
                  <td>{MEDICAL_RULES[r.type].label}</td>
                  <td>
                    {r.last ? fmt(r.last.doneOn) : 'None on file'}
                    {r.last && <div className="muted">{RESULT_LABEL[r.last.result]}</div>}
                  </td>
                  <td>
                    <Pill cls={STATE_CLS[r.state]}>{r.nextDue ? fmt(r.nextDue) : 'Done'}</Pill>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRecord({ e: r.e, type: r.type })}>
                      <Stethoscope size={13} /> Record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="medicals" sizes={[10, 25, 50]} />
      </div>
      {record && <RecordMedicalModal e={record.e} type={record.type} onClose={() => setRecord(null)} />}
    </>
  );
};

const RecordMedicalModal: React.FC<{ e: HREmployee; type: MedicalType; onClose: () => void }> = ({ e, type, onClose }) => {
  const { recordMedical } = useApp();
  const org = useOshOrg();
  const [doneOn, setOn] = useState(org.today);
  const [result, setResult] = useState<MedicalExam['result']>('FIT');
  const [practitioner, setPractitioner] = useState('Dr. Evans Kiprotich (DOSHS-designated)');
  const [note, setNote] = useState('');
  return (
    <Modal
      title={`${MEDICAL_RULES[type].label} · ${e.fullName}`}
      subtitle={`${e.staffId} · ${e.jobTitle}`}
      onClose={onClose}
      width={600}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            recordMedical({ staffId: e.staffId, type, doneOn, result, practitioner, note: note.trim() || undefined });
            onClose();
          }}
        >
          Save result
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Examined on</span>
          <input className="form-control" type="date" max={org.today} value={doneOn} onChange={(ev) => setOn(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Result</span>
          <select className="form-control" value={result} onChange={(ev) => setResult(ev.target.value as MedicalExam['result'])}>
            {(Object.keys(RESULT_LABEL) as MedicalExam['result'][]).map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field wide">
          <span>Practitioner</span>
          <input className="form-control" value={practitioner} onChange={(ev) => setPractitioner(ev.target.value)} />
        </label>
        <label className="req-field wide">
          <span>Restrictions or notes</span>
          <input className="form-control" value={note} onChange={(ev) => setNote(ev.target.value)} />
        </label>
      </div>
      {result === 'UNFIT' && <div className="pr-note warn">Review the role with HR before the employee returns to this work.</div>}
    </Modal>
  );
};
