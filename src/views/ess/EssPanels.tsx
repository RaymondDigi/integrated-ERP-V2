import { PhotoUpload } from '../../components/common/EmployeePhoto';
import { NextOfKinEditor } from '../../components/forms/NextOfKinEditor';
import { kinErrors, kinFromDrafts } from '../../utils/nextOfKin';
import React, { useEffect, useState } from 'react';
import {
  Printer,
  Download,
  FileText,
  Plus,
  Inbox,
  Search,
  Lock,
  Pencil,
  Check,
  X,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  ESS_EMPLOYEE,
  ESS_DOCUMENTS,
  REQUEST_ROUTING,
  formatKes,
  formatDate,
  type Payslip,
  type EssRequest,
  type EssRequestType,
  type EssProfileData,
  QUALIFICATIONS
} from './essData';
import { printArea } from './EssRecords';
import { PayslipDocument } from '../hr/payroll/PayslipDocument';

/* ------------------------------------------------------------------ */
/* Payslips                                                            */
/* ------------------------------------------------------------------ */

export const EssPayslips: React.FC<{ payslips: Payslip[] }> = ({ payslips }) => {
  const { hrEmployees, payrollCtx, tenantOrganizations } = useApp();
  const record = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
  const company = tenantOrganizations.find((t) => t.id === record?.orgId)?.name ?? 'Employer';
  const [selectedId, setSelectedId] = useState(payslips[0]?.id);
  const slip = payslips.find((p) => p.id === selectedId) ?? payslips[0];
  const ytdGross = payslips.reduce((s, p) => s + p.statutory.grossSalary, 0);
  const ytdTax = payslips.reduce((s, p) => s + p.statutory.payeNet, 0);
  const ytdNet = payslips.reduce((s, p) => s + p.netPay, 0);

  const print = printArea;

  if (!slip) return null;
  const s = slip.statutory;
  const d = slip.detail;
  const t = d.tax;
  // Every line payroll paid, including posted items (commission, overtime claims, reimbursements)
  const earnings = d.earnings.map((l) => ({ label: l.label, amount: l.amount, note: l.ref }));
  const reliefs = Math.round(t.personalRelief + t.housingRelief + t.insuranceRelief + t.pmfRelief);
  const deductions: { label: string; amount: number; note?: string }[] = [
    { label: `PAYE (after reliefs of ${formatKes(reliefs)})`, amount: s.payeNet, note: `Personal ${formatKes(t.personalRelief)}${t.insuranceRelief ? ` + insurance ${formatKes(t.insuranceRelief)}` : ''}${t.pmfRelief ? ` + PMF ${formatKes(t.pmfRelief)}` : ''}` },
    { label: `NSSF (Tier I ${formatKes(t.nssfTierI)} + Tier II ${formatKes(t.nssfTierII)})`, amount: s.nssfTotalEe },
    { label: 'SHIF (2.75%)', amount: s.shif },
    { label: 'Housing Levy (1.5%)', amount: s.ahlEe },
    ...d.pretax.filter((l) => l.flags.cash).map((l) => ({ label: l.label, amount: l.amount, note: l.ref })),
    ...d.deductions
      .filter((x) => x.deducted > 0)
      .map((x) => ({ label: x.label, amount: x.deducted, note: x.balanceAfter !== undefined ? `Balance after: ${formatKes(x.balanceAfter)}` : x.deferred ? `${formatKes(x.deferred)} deferred` : undefined }))
  ];
  const totalDeductions = deductions.reduce((sum, x) => sum + x.amount, 0);

  return (
    <div className="ess-split">
      <aside className="ess-card ess-slip-list">
        <div className="ess-card-head">
          <h3>Payslips</h3>
        </div>
        <ul>
          {payslips.map((p) => (
            <li key={p.id}>
              <button className={p.id === slip.id ? 'active' : ''} onClick={() => setSelectedId(p.id)}>
                <span>
                  <strong>{p.period}</strong>
                  <small>Paid {formatDate(p.payDate, { day: 'numeric', month: 'short' })}</small>
                </span>
                <span className="ess-slip-net">{formatKes(p.netPay)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="ess-ytd">
          <div>
            <span>Gross (6 mo.)</span>
            <strong>{formatKes(ytdGross)}</strong>
          </div>
          <div>
            <span>PAYE (6 mo.)</span>
            <strong>{formatKes(ytdTax)}</strong>
          </div>
          <div>
            <span>Net (6 mo.)</span>
            <strong>{formatKes(ytdNet)}</strong>
          </div>
        </div>
      </aside>

      {record && (
        <div className="sx-print-only ess-print-area">
          <PayslipDocument e={record} p={d} ctx={payrollCtx} company={company} />
        </div>
      )}
      <section className="ess-card ess-payslip" key={slip.id}>
        <div className="ess-payslip-head">
          <div>
            <span className="ess-eyebrow">Payslip · {slip.id}</span>
            <h2>{slip.period}</h2>
            <p>
              {ESS_EMPLOYEE.fullName} · {ESS_EMPLOYEE.staffId} · {ESS_EMPLOYEE.jobTitle}
            </p>
            <p>
              KRA PIN {ESS_EMPLOYEE.kraPinMasked} · Paid to {ESS_EMPLOYEE.bankAccountMasked} on {formatDate(slip.payDate)}
            </p>
          </div>
          <div className="ess-payslip-actions">
            <button className="btn btn-secondary btn-sm" onClick={print}>
              <Printer size={14} /> Print
            </button>
            <button className="btn btn-secondary btn-sm" onClick={print} title="Choose 'Save as PDF' in the print dialog">
              <Download size={14} /> PDF
            </button>
          </div>
        </div>

        <div className="ess-net-banner">
          <span>Net pay</span>
          <strong>{formatKes(slip.netPay)}</strong>
        </div>

        <div className="ess-payslip-cols">
          <div>
            <h4>Earnings</h4>
            {earnings.map((e, i) => (
              <div className="ess-line" key={i} title={e.note}>
                <span>{e.label}</span>
                <span>{formatKes(e.amount)}</span>
              </div>
            ))}
            {d.benefits.map((b, i) => (
              <div className="ess-line" key={`b${i}`} title={b.ref}>
                <span className="ess-muted">{b.label} (taxed, not paid)</span>
                <span className="ess-muted">{formatKes(b.amount)}</span>
              </div>
            ))}
            <div className="ess-line total">
              <span>Gross pay</span>
              <span>{formatKes(s.grossSalary)}</span>
            </div>
          </div>
          <div>
            <h4>Deductions</h4>
            {deductions.map((x, i) => (
              <div className="ess-line" key={i} title={x.note}>
                <span>{x.label}</span>
                <span>{formatKes(x.amount)}</span>
              </div>
            ))}
            <div className="ess-line total">
              <span>Total deductions</span>
              <span>{formatKes(totalDeductions)}</span>
            </div>
          </div>
        </div>

        <div className="ess-employer-note">
          <ShieldCheck size={14} />
          Employer also contributed {formatKes(s.nssfTotalEr)} NSSF, {formatKes(s.ahlEr)} Housing Levy and {formatKes(d.nita)} NITA on your behalf.
          Taxable pay: {formatKes(s.taxableIncome)}. Print gives the full payslip with the PAYE working and year-to-date totals.
        </div>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

const REQUEST_TYPES = Object.keys(REQUEST_ROUTING) as EssRequestType[];
const NEEDS_AMOUNT: EssRequestType[] = ['Salary Advance', 'Expense Reimbursement'];
const PLACEHOLDERS: Partial<Record<EssRequestType, string>> = {
  'Employment Confirmation Letter': 'Who should the letter be addressed to, and what is it for?',
  'Salary Advance': 'Reason for the advance and preferred repayment period (max 3 months).',
  'Expense Reimbursement': 'What was the expense for? Attach receipts when HR follows up.',
  'Bank / M-Pesa Details Change': 'New bank name, branch and account number, or new M-Pesa number.',
  'Equipment / Asset Request': 'Item needed and why (e.g., replacement laptop charger).',
  'Training Request': 'Course name, provider, dates and cost.',
  'Personal Details Change': 'Which details should change, and to what?',
  Resignation: 'Why you are leaving (optional — HR will also invite you to an exit interview).',
  'Safety Report': 'What did you see, where and when? e.g. loose cable across the corridor by the HR office.'
};

const STATUS_CLS: Record<EssRequest['status'], string> = {
  Submitted: 'info',
  'In Review': 'warning',
  Approved: 'success',
  Completed: 'success',
  Declined: 'critical'
};

const STEPS: EssRequest['status'][] = ['Submitted', 'In Review', 'Approved', 'Completed'];

interface EssRequestsProps {
  requests: EssRequest[];
  preset: EssRequestType | null;
  presetDetails?: string;
  onClearPreset: () => void;
  onSubmit: (r: Omit<EssRequest, 'id' | 'submittedOn' | 'status' | 'assignedTo' | 'staffId'>) => void;
  /** Contract notice in days, to suggest a last working day */
  noticeDays?: number;
  /** Requests handled in their own section (travel, welfare, medical…); picking one opens it */
  moreKinds?: { label: string; onPick: () => void }[];
}

export const EssRequests: React.FC<EssRequestsProps> = ({ requests, preset, presetDetails = '', onClearPreset, onSubmit, noticeDays = 30, moreKinds = [] }) => {
  const [formOpen, setFormOpen] = useState(!!preset);
  const [type, setType] = useState<EssRequestType>(preset ?? 'Employment Confirmation Letter');
  const [details, setDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('1');
  const [newValue, setNewValue] = useState('');
  const suggestedLastDay = (() => {
    const d = new Date();
    d.setDate(d.getDate() + noticeDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [lastDay, setLastDay] = useState(suggestedLastDay);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (preset) {
      setType(preset);
      setDetails(presetDetails);
      setFormOpen(true);
    }
  }, [preset, presetDetails]);

  const needsAmount = NEEDS_AMOUNT.includes(type);
  const amountNum = Number(amount);
  const needsDetails = type !== 'Resignation';
  const valid =
    (!needsDetails || details.trim().length > 0) &&
    (!needsAmount || amountNum > 0) &&
    (type !== 'Bank / M-Pesa Details Change' || newValue.trim().length > 0) &&
    (type !== 'Resignation' || !!lastDay);

  const close = () => {
    setFormOpen(false);
    setDetails('');
    setAmount('');
    setTouched(false);
    onClearPreset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit({
      type,
      details: details.trim(),
      amountKes: needsAmount ? amountNum : undefined,
      months: type === 'Salary Advance' ? Number(months) : undefined,
      newValue: type === 'Bank / M-Pesa Details Change' ? newValue.trim() : undefined,
      lastDay: type === 'Resignation' ? lastDay : undefined
    });
    close();
  };

  return (
    <div className="ess-stack">
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>{formOpen ? 'New request' : 'My requests'}</h3>
          {!formOpen && (
            <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} /> New request
            </button>
          )}
        </div>

        {formOpen && (
          <form className="ess-form" onSubmit={submit} noValidate>
            <div className="ess-type-grid" role="radiogroup" aria-label="Request type">
              {REQUEST_TYPES.map((t) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  key={t}
                  className={`ess-type-chip ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {t}
                </button>
              ))}
              {moreKinds.map((k) => (
                <button type="button" key={k.label} className="ess-type-chip more" onClick={k.onPick}>
                  {k.label} →
                </button>
              ))}
            </div>

            <div className="ess-form-grid">
              <label className={`req-field ${needsAmount ? 'ess-span-3' : 'ess-span-full'}`}>
                <span>Details{needsDetails ? ' *' : ''}</span>
                <textarea
                  className={`form-control ${touched && !details.trim() ? 'is-invalid' : ''}`}
                  rows={3}
                  placeholder={PLACEHOLDERS[type]}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
              {needsAmount && (
                <label className="req-field">
                  <span>Amount (KES) *</span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    className={`form-control ${touched && !(amountNum > 0) ? 'is-invalid' : ''}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
              )}
              {type === 'Salary Advance' && (
                <label className="req-field">
                  <span>Repay over</span>
                  <select className="form-control" value={months} onChange={(e) => setMonths(e.target.value)}>
                    <option value="1">1 month</option>
                    <option value="2">2 months</option>
                    <option value="3">3 months</option>
                  </select>
                </label>
              )}
              {type === 'Bank / M-Pesa Details Change' && (
                <label className="req-field ess-span-full">
                  <span>New account or M-Pesa number *</span>
                  <input className="form-control" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. KCB 11****829 or +254 722 *** 905" />
                </label>
              )}
              {type === 'Resignation' && (
                <label className="req-field">
                  <span>Last working day *</span>
                  <input type="date" className="form-control" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
                  <span className="ess-hint">Your contract asks for {noticeDays} days' notice. Leaving earlier means the shortfall may be deducted from final dues.</span>
                </label>
              )}
            </div>

            {touched && !valid && (
              <div className="req-error">
                <AlertCircle size={14} />
                {needsDetails && !details.trim() ? 'Please add details for this request.' : needsAmount && !(amountNum > 0) ? 'Enter an amount greater than zero.' : 'Fill in the required fields.'}
              </div>
            )}

            <div className="ess-form-actions">
              <span className="ess-hint">Routed to: {REQUEST_ROUTING[type]}</span>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Submit request
              </button>
            </div>
          </form>
        )}

        {!formOpen &&
          (requests.length === 0 ? (
            <div className="ess-empty">
              <Inbox size={28} />
              <strong>No requests yet</strong>
              <span>Letters, advances, claims and detail changes you request appear here.</span>
            </div>
          ) : (
            <ul className="ess-request-list">
              {requests.map((r) => {
                const stepIdx = STEPS.indexOf(r.status);
                return (
                  <li key={r.id} className="ess-request">
                    <div className="ess-request-top">
                      <div>
                        <strong>{r.type}</strong>
                        <span className="ess-muted">
                          {r.id} · {formatDate(r.submittedOn)} · {r.assignedTo}
                          {r.amountKes ? ` · ${formatKes(r.amountKes)}` : ''}
                        </span>
                      </div>
                      <span className={`digicraft-status-pill ${STATUS_CLS[r.status]}`}>{r.status}</span>
                    </div>
                    {r.details && <p>{r.details}</p>}
                    {r.lastDay && <p className="ess-muted">Last working day {formatDate(r.lastDay)}</p>}
                    {r.decidedBy && (
                      <p className="ess-muted">
                        {r.status === 'Declined' ? 'Declined' : 'Decided'} by {r.decidedBy}
                        {r.decidedOn ? ` on ${formatDate(r.decidedOn)}` : ''}
                        {r.note ? ` — ${r.note}` : ''}
                        {r.link && !r.note?.includes(r.link) ? ` (${r.link})` : ''}
                      </p>
                    )}
                    {!r.decidedBy && r.link && <p className="ess-muted">Opened {r.link} — HR will be in touch.</p>}
                    {r.status !== 'Declined' && (
                      <div className="ess-steps" aria-label={`Progress: ${r.status}`}>
                        {STEPS.map((step, i) => (
                          <span key={step} className={i <= stepIdx ? 'done' : ''}>
                            {step}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const EssDocuments: React.FC = () => {
  const { addToast } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const categories = ['All', ...Array.from(new Set(ESS_DOCUMENTS.map((d) => d.category)))];
  const docs = ESS_DOCUMENTS.filter(
    (d) => (category === 'All' || d.category === category) && d.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="ess-card">
      <div className="ess-card-head ess-doc-toolbar">
        <h3>My documents</h3>
        <div className="ess-doc-filters">
          <div className="ess-search">
            <Search size={14} />
            <input placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="ess-chip-row">
            {categories.map((c) => (
              <button key={c} className={`digicraft-filter-pill ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="ess-empty">
          <FileText size={28} />
          <strong>No documents match</strong>
          <span>Try a different search or category.</span>
        </div>
      ) : (
        <ul className="ess-doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <span className="ess-doc-icon">
                <FileText size={18} />
              </span>
              <div className="ess-doc-meta">
                <strong>{d.name}</strong>
                <span className="ess-muted">
                  {d.category} · {d.size} · {formatDate(d.date)}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => addToast({ type: 'info', title: 'Download started', message: `${d.name} is downloading.` })}
              >
                <Download size={14} /> Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export const EssProfile: React.FC<{
  profile: EssProfileData;
  onSave: (p: EssProfileData) => void;
  onRequestChange: (t: EssRequestType) => void;
}> = ({ profile, onSave, onRequestChange }) => {
  const { addToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);

  // Keep the draft in sync when the profile changes elsewhere (e.g. an AI fix)
  useEffect(() => {
    if (!editing) setDraft(profile);
  }, [profile, editing]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.personalEmail);
  const phoneOk = (p: string) => p.trim() === '' || /^\+?[\d\s]{9,16}$/.test(p.trim());
  const dependantsOk = draft.dependants.trim() === '' || /^\d{1,2}$/.test(draft.dependants.trim());
  const kinErrs = kinErrors(draft.kins);
  const kinsShown = kinFromDrafts(profile.kins).nextOfKins ?? [];
  const valid = emailOk && /^\+?[\d\s]{9,16}$/.test(draft.phone.trim()) && !Object.keys(kinErrs).length && phoneOk(draft.emPhone) && dependantsOk;

  const save = () => {
    if (!valid) return;
    // The primary next of kin is mirrored into the single fields older screens and the assistant read
    const { nextOfKin } = kinFromDrafts(draft.kins);
    onSave({ ...draft, kinName: nextOfKin?.name ?? '', kinRelationship: nextOfKin?.relationship ?? '', kinPhone: nextOfKin?.phone ?? '' });
    setEditing(false);
    addToast({ type: 'success', title: 'Profile updated', message: 'Your personal, contact and next-of-kin details were saved.' });
  };

  const onPhoto = (photoUrl: string | undefined) => {
    onSave({ ...profile, hasPhoto: !!photoUrl, photoUrl });
    addToast({ type: 'success', title: photoUrl ? 'Photo updated' : 'Photo removed', message: photoUrl ? 'HR, your manager and the staff directory now show this photo.' : 'Your initials are shown instead.' });
  };

  type TextKey = Exclude<keyof EssProfileData, 'hasPhoto' | 'photoUrl' | 'maritalStatus' | 'kins'>;

  const field = (key: TextKey, label: string, ok = true, type = 'text', placeholder = '') => (
    <label className="req-field">
      <span>{label}</span>
      {editing ? (
        <input
          type={type}
          className={`form-control ${ok ? '' : 'is-invalid'}`}
          value={draft[key]}
          placeholder={placeholder}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      ) : (
        <span className={`ess-value ${profile[key] ? '' : 'ess-missing'}`}>{profile[key] || 'Not provided'}</span>
      )}
    </label>
  );

  const select = (key: 'maritalStatus' | 'highestQualification', label: string, options: string[]) => (
    <label className="req-field">
      <span>{label}</span>
      {editing ? (
        <select className="form-control" value={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }) as EssProfileData)}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <span className={`ess-value ${profile[key] ? '' : 'ess-missing'}`}>{profile[key] || 'Not provided'}</span>
      )}
    </label>
  );

  const readOnly = (label: string, value: string) => (
    <div className="req-field">
      <span>{label}</span>
      <span className="ess-value">{value}</span>
    </div>
  );

  const tenureYears = Math.floor((Date.now() - new Date(ESS_EMPLOYEE.joinedDate).getTime()) / (365.25 * 86400000));

  return (
    <div className="ess-profile">
      <aside className="ess-card ess-profile-card">
        <div className="ess-photo-wrap">
          <PhotoUpload name={ESS_EMPLOYEE.fullName} photoUrl={profile.photoUrl} size={88} withButtons={false} onChange={onPhoto} onError={(m) => addToast({ type: 'warning', title: 'Photo not accepted', message: m })} />
        </div>
        {profile.photoUrl && (
          <button className="ess-link-btn" onClick={() => onPhoto(undefined)}>
            Remove photo
          </button>
        )}
        <h2>{ESS_EMPLOYEE.fullName}</h2>
        <p>{ESS_EMPLOYEE.jobTitle}</p>
        <span className="badge badge-success">Active</span>
        <ul className="ess-profile-facts">
          <li>
            <Building2 size={14} /> {ESS_EMPLOYEE.department}, {ESS_EMPLOYEE.branch}
          </li>
          <li title="Your work email signs you in and receives approval requests">
            <Mail size={14} /> {ESS_EMPLOYEE.workEmail} <small className="ess-hint">· sign-in</small>
          </li>
          <li>
            <Phone size={14} /> {profile.phone}
          </li>
        </ul>
        <div className="ess-profile-tenure">
          <div>
            <strong>{tenureYears}</strong>
            <span>years of service</span>
          </div>
          <div>
            <strong>{ESS_EMPLOYEE.grade.split(' ')[0]}</strong>
            <span>job grade</span>
          </div>
        </div>
      </aside>

      <div className="ess-stack">
        <section className="ess-card">
          <div className="ess-card-head">
            <h3>Personal, contact & next of kin</h3>
            {editing ? (
              <div className="ess-inline-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setDraft(profile);
                    setEditing(false);
                  }}
                >
                  <X size={14} /> Cancel
                </button>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={!valid}>
                  <Check size={14} /> Save
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>

          <h4 className="ess-subhead">Personal</h4>
          <div className="ess-form-grid">
            {select('maritalStatus', 'Marital status', ['Single', 'Married', 'Divorced', 'Widowed'])}
            {field('dependants', 'Number of dependants', dependantsOk, 'number', 'e.g. 2')}
            <div className="ess-span-2">{select('highestQualification', 'Highest qualification', QUALIFICATIONS)}</div>
          </div>

          <h4 className="ess-subhead">Contact</h4>
          <div className="ess-form-grid">
            {field('phone', 'Mobile number', /^\+?[\d\s]{9,16}$/.test(draft.phone.trim()), 'tel')}
            {field('personalEmail', 'Personal email — payslips & notices', emailOk, 'email')}
            {field('address', 'Home address')}
            {field('postalAddress', 'Postal address', true, 'text', 'e.g. P.O. Box 1234-00100 Nairobi')}
          </div>

          <h4 className="ess-subhead">Next of kin{kinsShown.length > 1 ? ` (${kinsShown.length})` : ''}</h4>
          {editing ? (
            <NextOfKinEditor value={draft.kins} onChange={(kins) => setDraft((d) => ({ ...d, kins }))} errors={kinErrs} />
          ) : (
            <ul className="ess-kin-list">
              {kinsShown.map((k, i) => (
                <li key={i}>
                  <div>
                    <strong>{k.name}</strong>
                    {k.primary && kinsShown.length > 1 && <span className="badge badge-success">Primary</span>}
                    <span className="ess-hint">
                      {k.relationship} · {k.phone}
                      {k.email ? ` · ${k.email}` : ''}
                    </span>
                  </div>
                  {k.benefitPct !== undefined && <span className="ess-kin-share">{k.benefitPct}%</span>}
                </li>
              ))}
              {!kinsShown.length && <li className="ess-missing">No next of kin on file — add at least one.</li>}
            </ul>
          )}

          <h4 className="ess-subhead">Emergency contact</h4>
          <div className="ess-form-grid">
            {field('emName', 'Emergency contact', true, 'text', 'Someone other than you')}
            {field('emRelationship', 'Relationship')}
            {field('emPhone', 'Emergency phone', phoneOk(draft.emPhone), 'tel')}
          </div>
          {editing && !valid && (
            <div className="req-error" style={{ marginTop: 12 }}>
              <AlertCircle size={14} /> Check the highlighted fields.
            </div>
          )}
        </section>

        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <Lock size={14} /> Employment & statutory
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onRequestChange('Personal Details Change')}>
              Request a change
            </button>
          </div>
          <div className="ess-form-grid">
            {readOnly('Staff ID', ESS_EMPLOYEE.staffId)}
            {readOnly('Reports to', ESS_EMPLOYEE.manager)}
            {readOnly('Contract', ESS_EMPLOYEE.contractType)}
            {readOnly('Date joined', formatDate(ESS_EMPLOYEE.joinedDate))}
            {readOnly('National ID', ESS_EMPLOYEE.nationalIdMasked)}
            {readOnly('KRA PIN', ESS_EMPLOYEE.kraPinMasked)}
            {readOnly('NSSF No.', ESS_EMPLOYEE.nssfNoMasked)}
            {readOnly('SHIF No.', ESS_EMPLOYEE.shifNoMasked)}
          </div>
        </section>

        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <Lock size={14} /> Payment details
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onRequestChange('Bank / M-Pesa Details Change')}>
              Request a change
            </button>
          </div>
          <div className="ess-form-grid">
            {readOnly('Bank account', ESS_EMPLOYEE.bankAccountMasked)}
            {readOnly('M-Pesa number', ESS_EMPLOYEE.mpesaPhoneMasked)}
          </div>
          <p className="ess-hint" style={{ marginTop: 10 }}>
            For your security, payment and statutory details can only be changed by Payroll after verification.
          </p>
        </section>
      </div>
    </div>
  );
};
