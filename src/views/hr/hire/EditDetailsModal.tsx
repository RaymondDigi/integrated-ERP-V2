import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldAlert, TrendingUp, ArrowLeftRight, FileClock, FileText } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { CHANGE_LABEL, type ChangeKind } from '../../../data/hireConfig';
import { KENYAN_BANKS } from '../../../data/orgData';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { basicFor, isCasual } from '../../../data/payrollEngine';
import { supervisorFor } from '../../../data/leaveConfig';
import { DEFAULT_PWD_EXEMPT_AMOUNT } from '../../../utils/tax';
import { gradeOf, hrOfficer, kes, maskAccount, maskId, maskKra, maskNssf, maskPhone, maskShif, todayIso } from '../../../data/hireEngine';
import { Modal, PersonSelect, useApprovers } from './shared';

/** Demo reveal: fills the masked part with a stable pattern. Real reveals come from the vault and are logged. */
export const reveal = (masked: string, on: boolean) => (on ? masked.replace(/\*+/g, (m) => '7392815640'.slice(0, m.length)) : masked);

/* ------------------------------------------------------------------ validation */

const PHONE_RE = /^\+?[\d\s]{9,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const KRA_PIN_RE = /^A\d{9}[A-Z]$/;
const NATIONAL_ID_RE = /^\d{7,9}$/;
const NSSF_RE = /^\d{6,12}$/;
const SHIF_RE = /^(CR)?\d{6,14}(-\d)?$/i;
const MPESA_RE = /^(\+?254|0)[71]\d{8}$/;
const ACCOUNT_RE = /^\d{6,16}$/;
const TAX_EXEMPT_REASONS = ['Income below taxable threshold', 'Diplomatic or treaty exemption', 'KRA exemption certificate', 'Court order or KRA directive', 'Other approved exemption'];

const bankOf = (e: HREmployee) => {
  if (e.bankName) return e.bankName;
  const first = (e.bankAccountMasked || '').split(' ')[0];
  if (!first || first === '—') return '';
  return KENYAN_BANKS.find((b) => b.toLowerCase().startsWith(first.toLowerCase())) ?? first;
};

const splitName = (e: HREmployee) => {
  if (e.firstName || e.lastName) return { firstName: e.firstName ?? '', middleName: e.middleName ?? '', lastName: e.lastName ?? '' };
  const parts = e.fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', middleName: parts.slice(1, -1).join(' '), lastName: parts.length > 1 ? parts[parts.length - 1] : '' };
};

const ageOn = (dob: string, on: string) => {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

const taxLabel = (t: HREmployee['tax']) => {
  const x = t ?? { employment: 'PRIMARY', pwdExempt: false, taxExempt: false };
  return [x.employment === 'SECONDARY' ? 'Secondary' : 'Primary', x.pwdExempt ? `PWD exempt (cert ${x.pwdCertificateNo || '—'}, KES ${(x.pwdExemptAmount ?? 0).toLocaleString()})` : '', x.taxExempt ? `zero tax (${x.taxExemptReason || '—'})` : '']
    .filter(Boolean)
    .join(', ');
};

const contactOf = (c?: { name: string; relationship: string; phone: string }) => (c ? `${c.name} (${c.relationship || '—'}) ${c.phone}` : '—');

interface Form {
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  personalEmail: string;
  phone: string;
  address: string;
  kinName: string;
  kinRelationship: string;
  kinPhone: string;
  ecName: string;
  ecRelationship: string;
  ecPhone: string;
  nationalId: string;
  kraPin: string;
  nssfNo: string;
  shifNo: string;
  paymentMethod: 'BANK' | 'MPESA';
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  mpesaNumber: string;
  taxEmployment: 'PRIMARY' | 'SECONDARY';
  pwdExempt: boolean;
  pwdCertificateNo: string;
  pwdCertificateExpiry: string;
  pwdExemptAmount: string;
  taxExempt: boolean;
  taxExemptReason: string;
  email: string;
  phoneExtension: string;
  branch: string;
  stationId: string;
  block: string;
  costCenter: string;
  supervisor: string;
  reason: string;
}

const formOf = (e: HREmployee, supervisor: string): Form => ({
  ...splitName(e),
  gender: e.gender ?? '',
  dateOfBirth: e.dateOfBirth ?? '',
  maritalStatus: e.maritalStatus ?? '',
  personalEmail: e.personalEmail ?? '',
  phone: e.phone ?? '',
  address: e.address ?? '',
  kinName: e.nextOfKin?.name ?? '',
  kinRelationship: e.nextOfKin?.relationship ?? '',
  kinPhone: e.nextOfKin?.phone ?? '',
  ecName: e.emergencyContact?.name ?? '',
  ecRelationship: e.emergencyContact?.relationship ?? '',
  ecPhone: e.emergencyContact?.phone ?? '',
  nationalId: '',
  kraPin: '',
  nssfNo: '',
  shifNo: '',
  paymentMethod: isCasual(e) || e.paymentMethod === 'MPESA' ? 'MPESA' : 'BANK',
  bankName: bankOf(e),
  bankBranch: e.bankBranch ?? '',
  bankAccount: '',
  mpesaNumber: '',
  taxEmployment: e.tax?.employment ?? 'PRIMARY',
  pwdExempt: !!e.tax?.pwdExempt,
  pwdCertificateNo: e.tax?.pwdCertificateNo ?? '',
  pwdCertificateExpiry: e.tax?.pwdCertificateExpiry ?? '',
  pwdExemptAmount: String(e.tax?.pwdExemptAmount ?? DEFAULT_PWD_EXEMPT_AMOUNT),
  taxExempt: !!e.tax?.taxExempt,
  taxExemptReason: e.tax?.taxExemptReason ?? '',
  email: e.email ?? '',
  phoneExtension: e.phoneExtension ?? '',
  branch: e.branch ?? '',
  stationId: e.stationId ?? '',
  block: e.block ?? '',
  costCenter: e.costCenter ?? '',
  supervisor,
  reason: ''
});

const has = (v?: string) => !!v && v !== '—';

/* ------------------------------------------------------------------ field */

const EF: React.FC<{ label: string; error?: string; hint?: React.ReactNode; wide?: boolean; children: React.ReactNode }> = ({ label, error, hint, wide, children }) => (
  <label className={`req-field ${wide ? 'wide' : ''}`}>
    <span>{label}</span>
    {children}
    {error ? (
      <small className="hi-err" role="alert">
        {error}
      </small>
    ) : hint ? (
      <small className="hi-hint">{hint}</small>
    ) : null}
  </label>
);

/* ------------------------------------------------------------------ modal */

/**
 * Direct edit of details that do not change pay or the job. Pay, title, grade, department and contract
 * stay read-only here and go through the approved change requests.
 */
export const EditDetailsModal: React.FC<{ e: HREmployee; unmask?: boolean; onClose: () => void; onRequestChange: (k: ChangeKind) => void }> = ({ e, unmask: unmaskInitial = false, onClose, onRequestChange }) => {
  const { hrEmployees, tenantEmployees, orgStructure, updateHrEmployee, logEmployeeEdit, addToast, payrollOpenPeriod, employeeChanges } = useApp();
  const approvers = useApprovers();
  const hrPeople = useMemo(() => {
    const hrOnly = approvers.filter((p) => /\bHR\b|human resource/i.test(p.jobTitle) && p.staffId !== e.staffId);
    return hrOnly.length ? hrOnly : approvers.filter((p) => p.staffId !== e.staffId);
  }, [approvers, e.staffId]);
  const officer = hrOfficer(e.orgId, hrEmployees);
  const [actor, setActor] = useState((hrPeople.find((p) => p.staffId === officer?.staffId) ?? hrPeople[0])?.staffId ?? '');
  const initialSup = e.reportsToStaffId ?? supervisorFor(e, hrEmployees)?.staffId ?? '';
  const initial = useMemo(() => formOf(e, initialSup), [e, initialSup]);
  const [f, setF] = useState<Form>(initial);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [unmask, setUnmask] = useState(unmaskInitial);
  const casual = isCasual(e);
  const today = todayIso();
  const ct = CONTRACT_TYPES.find((c) => c.name === e.contractType);
  const leaving = e.status === 'TERMINATED' || !!e.exitDate;
  const pending = employeeChanges.filter((c) => c.staffId === e.staffId && c.status === 'PENDING');

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setDirty((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  };

  const branches = useMemo(() => [...new Set([e.branch, ...orgStructure.branches.map((b) => b.name)].filter(Boolean))], [e.branch, orgStructure.branches]);
  const branchRec = orgStructure.branches.find((b) => b.name === f.branch);
  const stations = orgStructure.stations.filter((s) => s.branchId === (branchRec?.id ?? e.branchId));
  const supervisors = tenantEmployees.filter((x) => x.staffId !== e.staffId && x.status !== 'TERMINATED' && x.basicSalaryKes >= 45_000);
  const bankChanged = f.bankName !== initial.bankName;

  /* --------------------------------------------- changes */
  const fullName = [f.firstName, f.middleName, f.lastName].map((x) => x.trim()).filter(Boolean).join(' ');
  const kin = f.kinName.trim() ? { name: f.kinName.trim(), relationship: f.kinRelationship.trim(), phone: f.kinPhone.trim() } : undefined;
  const ec = f.ecName.trim() ? { name: f.ecName.trim(), relationship: f.ecRelationship.trim(), phone: f.ecPhone.trim() } : undefined;
  const newTax: NonNullable<HREmployee['tax']> = {
    employment: f.taxEmployment,
    pwdExempt: f.pwdExempt,
    pwdCertificateNo: f.pwdExempt ? f.pwdCertificateNo.trim() : undefined,
    pwdCertificateExpiry: f.pwdExempt ? f.pwdCertificateExpiry : undefined,
    pwdExemptAmount: f.pwdExempt ? Number(f.pwdExemptAmount) : undefined,
    taxExempt: f.taxExempt,
    taxExemptReason: f.taxExempt ? f.taxExemptReason : undefined
  };
  const oldTax = e.tax ?? { employment: 'PRIMARY' as const, pwdExempt: false, taxExempt: false };
  const taxChanged =
    newTax.employment !== oldTax.employment ||
    newTax.pwdExempt !== !!oldTax.pwdExempt ||
    newTax.taxExempt !== !!oldTax.taxExempt ||
    (newTax.pwdExempt && (newTax.pwdCertificateNo !== oldTax.pwdCertificateNo || newTax.pwdCertificateExpiry !== oldTax.pwdCertificateExpiry || newTax.pwdExemptAmount !== oldTax.pwdExemptAmount)) ||
    (newTax.taxExempt && newTax.taxExemptReason !== oldTax.taxExemptReason);

  const account = f.bankAccount.replace(/\s/g, '');
  const mpesa = f.mpesaNumber.replace(/\s/g, '');
  const newBankMasked = f.paymentMethod === 'BANK' && f.bankName && (account || bankChanged) && ACCOUNT_RE.test(account) ? maskAccount(f.bankName, account) : null;
  const newMpesaMasked = mpesa && MPESA_RE.test(mpesa) ? maskPhone(mpesa) : null;

  type Change = { label: string; from: string; to: string; sensitive?: boolean };
  const changes: Change[] = [];
  const patch: Partial<HREmployee> = {};
  const cmp = (label: string, from: string | undefined, to: string, apply: () => void, sensitive = false) => {
    if ((from ?? '') !== to) {
      changes.push({ label, from: from || '—', to: to || '—', sensitive });
      apply();
    }
  };
  // Personal
  cmp('name', e.fullName, fullName, () => Object.assign(patch, { fullName, firstName: f.firstName.trim(), middleName: f.middleName.trim() || undefined, lastName: f.lastName.trim() }));
  if (fullName === e.fullName && (f.firstName !== initial.firstName || f.middleName !== initial.middleName || f.lastName !== initial.lastName))
    Object.assign(patch, { firstName: f.firstName.trim(), middleName: f.middleName.trim() || undefined, lastName: f.lastName.trim() });
  cmp('gender', e.gender, f.gender, () => (patch.gender = (f.gender || undefined) as HREmployee['gender']));
  cmp('date of birth', e.dateOfBirth, f.dateOfBirth, () => (patch.dateOfBirth = f.dateOfBirth || undefined));
  cmp('marital status', e.maritalStatus, f.maritalStatus, () => (patch.maritalStatus = f.maritalStatus || undefined));
  cmp('personal email', e.personalEmail, f.personalEmail.trim(), () => (patch.personalEmail = f.personalEmail.trim() || undefined));
  cmp('phone', e.phone, f.phone.trim(), () => (patch.phone = f.phone.trim()));
  cmp('address', e.address, f.address.trim(), () => (patch.address = f.address.trim() || undefined));
  cmp('next of kin', e.nextOfKin ? contactOf(e.nextOfKin) : '', kin ? contactOf(kin) : '', () => (patch.nextOfKin = kin));
  cmp('emergency contact', e.emergencyContact ? contactOf(e.emergencyContact) : '', ec ? contactOf(ec) : '', () => (patch.emergencyContact = ec));
  // Statutory and KYC (only when a new value is entered)
  if (f.nationalId.trim() && NATIONAL_ID_RE.test(f.nationalId.trim())) cmp('national ID', e.nationalIdMasked, maskId(f.nationalId.trim()), () => (patch.nationalIdMasked = maskId(f.nationalId.trim())), true);
  if (f.kraPin.trim() && KRA_PIN_RE.test(f.kraPin.trim())) cmp('KRA PIN', e.kraPinMasked, maskKra(f.kraPin.trim()), () => (patch.kraPinMasked = maskKra(f.kraPin.trim())), true);
  if (f.nssfNo.trim() && NSSF_RE.test(f.nssfNo.trim())) cmp('NSSF number', e.nssfNoMasked, maskNssf(f.nssfNo.trim()), () => (patch.nssfNoMasked = maskNssf(f.nssfNo.trim())), true);
  if (f.shifNo.trim() && SHIF_RE.test(f.shifNo.trim())) cmp('SHIF number', e.shifNoMasked, maskShif(f.shifNo.trim()), () => (patch.shifNoMasked = maskShif(f.shifNo.trim())), true);
  // Payment
  if (!casual) cmp('pay rail', initial.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Bank', f.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Bank', () => (patch.paymentMethod = f.paymentMethod), true);
  if (newBankMasked) cmp('bank account', e.bankAccountMasked, newBankMasked, () => Object.assign(patch, { bankAccountMasked: newBankMasked, bankName: f.bankName }), true);
  if (f.paymentMethod === 'BANK') cmp('bank branch', e.bankBranch, f.bankBranch.trim(), () => (patch.bankBranch = f.bankBranch.trim() || undefined), true);
  if (newMpesaMasked) cmp('M-Pesa number', e.mpesaPhoneMasked, newMpesaMasked, () => (patch.mpesaPhoneMasked = newMpesaMasked), true);
  // Tax
  if (taxChanged) {
    changes.push({ label: 'tax profile', from: taxLabel(e.tax), to: taxLabel(newTax), sensitive: true });
    patch.tax = newTax;
    patch.statutory = { ...(e.statutory ?? { paye: true, nssf: true, shif: true, ahl: true }), paye: !newTax.taxExempt };
  }
  // Work details
  cmp('work email', e.email, f.email.trim(), () => (patch.email = f.email.trim()));
  cmp('phone extension', e.phoneExtension, f.phoneExtension.trim(), () => (patch.phoneExtension = f.phoneExtension.trim() || undefined));
  cmp('branch', e.branch, f.branch, () => Object.assign(patch, { branch: f.branch, branchId: branchRec?.id ?? e.branchId }));
  cmp(
    'station',
    orgStructure.stations.find((s) => s.id === e.stationId)?.name ?? '',
    orgStructure.stations.find((s) => s.id === f.stationId)?.name ?? '',
    () => (patch.stationId = f.stationId || undefined)
  );
  cmp('block', e.block, f.block.trim(), () => (patch.block = f.block.trim() || undefined));
  cmp('cost centre', e.costCenter, f.costCenter.trim(), () => (patch.costCenter = f.costCenter.trim() || undefined));
  cmp('supervisor', hrEmployees.find((x) => x.staffId === initialSup)?.fullName ?? '', hrEmployees.find((x) => x.staffId === f.supervisor)?.fullName ?? '', () => (patch.reportsToStaffId = f.supervisor || undefined));
  const sensitive = changes.filter((c) => c.sensitive);

  /* --------------------------------------------- validation */
  const errs: Record<string, string> = {};
  if (!f.firstName.trim()) errs.firstName = 'First name is required';
  if (!f.lastName.trim()) errs.lastName = 'Last name is required';
  if (f.dateOfBirth && (f.dateOfBirth > today || ageOn(f.dateOfBirth, today) < 18)) errs.dateOfBirth = 'Employee must be at least 18 years old';
  if (f.personalEmail.trim() && !EMAIL_RE.test(f.personalEmail.trim())) errs.personalEmail = 'Enter a valid email';
  if (!f.phone.trim()) errs.phone = 'Mobile number is required';
  else if (!PHONE_RE.test(f.phone.trim())) errs.phone = 'Use a format like +254 712 345 678';
  if ((f.kinRelationship || f.kinPhone) && !f.kinName.trim()) errs.kinName = 'Name the next of kin';
  if (f.kinPhone.trim() && !PHONE_RE.test(f.kinPhone.trim())) errs.kinPhone = 'Check the number';
  if ((f.ecRelationship || f.ecPhone) && !f.ecName.trim()) errs.ecName = 'Name the emergency contact';
  if (f.ecName.trim() && !f.ecPhone.trim()) errs.ecPhone = 'A phone number is needed for emergencies';
  else if (f.ecPhone.trim() && !PHONE_RE.test(f.ecPhone.trim())) errs.ecPhone = 'Check the number';
  if (f.nationalId.trim() && !NATIONAL_ID_RE.test(f.nationalId.trim())) errs.nationalId = 'National ID is 7–9 digits';
  if (f.kraPin.trim() && !KRA_PIN_RE.test(f.kraPin.trim())) errs.kraPin = 'KRA PIN looks like A123456789Z (A, 9 digits, a letter)';
  if (f.nssfNo.trim() && !NSSF_RE.test(f.nssfNo.trim())) errs.nssfNo = 'NSSF number is 6–12 digits';
  if (f.shifNo.trim() && !SHIF_RE.test(f.shifNo.trim())) errs.shifNo = 'Use the SHA member number, e.g. CR1234567890123-4';
  if (f.paymentMethod === 'BANK' && !casual) {
    if (!f.bankName) errs.bankName = 'Choose the bank';
    if (account && !ACCOUNT_RE.test(account)) errs.bankAccount = 'Digits only, 6–16 long';
    else if (!account && (bankChanged || !has(e.bankAccountMasked))) errs.bankAccount = bankChanged ? 'Enter the account number at the new bank' : 'Enter the account number';
  }
  if (mpesa && !MPESA_RE.test(mpesa)) errs.mpesaNumber = 'Use a Safaricom number like +254712345678';
  else if (!mpesa && f.paymentMethod === 'MPESA' && !has(e.mpesaPhoneMasked)) errs.mpesaNumber = 'Enter the M-Pesa number';
  if (f.pwdExempt && !f.taxExempt) {
    if (!f.pwdCertificateNo.trim()) errs.pwdCertificateNo = 'Exemption certificate number is required';
    if (!f.pwdCertificateExpiry) errs.pwdCertificateExpiry = 'Certificate expiry date is required';
    else if (f.pwdCertificateExpiry < today) errs.pwdCertificateExpiry = 'This certificate has expired';
    if (!(Number(f.pwdExemptAmount) > 0)) errs.pwdExemptAmount = 'Enter the exempt amount';
  }
  if (f.taxExempt && !f.taxExemptReason) errs.taxExemptReason = 'Choose the reason for zero tax';
  if (!f.email.trim()) errs.email = 'Work email is required';
  else if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Enter a valid email';
  if (f.phoneExtension.trim() && !/^\d{2,6}$/.test(f.phoneExtension.trim())) errs.phoneExtension = '2–6 digits';
  if (sensitive.length && f.reason.trim().length < 5) errs.reason = `Give a reason: ${sensitive.map((c) => c.label).join(', ')} ${sensitive.length > 1 ? 'are' : 'is'} sensitive`;
  if (!actor) errs.actor = 'Choose who is making the change';
  const err = (k: string) => (tried || dirty.has(k) ? errs[k] : undefined);
  const errCount = Object.keys(errs).length;

  const save = () => {
    setTried(true);
    if (errCount) {
      addToast({ type: 'error', title: 'Check the highlighted fields', message: Object.values(errs).slice(0, 3).join('. ') + (errCount > 3 ? ` (+${errCount - 3} more)` : '') });
      return;
    }
    if (!changes.length) {
      addToast({ type: 'info', title: 'Nothing changed', message: `${e.fullName}'s record is unchanged.` });
      onClose();
      return;
    }
    const by = hrEmployees.find((x) => x.staffId === actor)?.fullName ?? 'HR office';
    const reason = f.reason.trim();
    const summary = `Changed ${changes.map((c) => c.label).join(', ')}${reason ? ` — ${reason}` : ''}`;
    updateHrEmployee(e.staffId, { ...patch, history: [...(e.history ?? []), { date: today, kind: 'Details updated', summary, by }] });
    logEmployeeEdit(
      e.staffId,
      [
        { action: `Details updated: ${changes.map((c) => c.label).join(', ')}` },
        ...sensitive.map((c) => ({ action: `${c.label}: ${c.from} → ${c.to}${reason ? ` (reason: ${reason})` : ''}`, sensitive: true }))
      ],
      by
    );
    addToast({ type: 'success', title: 'Details saved', message: `${fullName}: ${changes.map((c) => c.label).join(', ')} updated.${sensitive.some((c) => /bank|M-Pesa|pay rail|tax/.test(c.label)) ? ` Payroll uses the new details from ${payrollOpenPeriod.label}.` : ''}` });
    onClose();
  };

  const basic = casual ? 0 : basicFor(e, payrollOpenPeriod.year, payrollOpenPeriod.month);
  const requests: { kind: ChangeKind; label: string; icon: typeof TrendingUp; show: boolean }[] = [
    { kind: 'PROMOTION', label: 'Promotion / increment', icon: TrendingUp, show: !casual },
    { kind: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, show: true },
    { kind: 'RENEW_CONTRACT', label: 'Renew contract', icon: FileClock, show: !!ct?.hasEndDate && !casual },
    { kind: 'CONVERT_CONTRACT', label: 'Convert contract', icon: FileText, show: !casual }
  ];

  return (
    <Modal
      title={`Edit details · ${e.fullName}`}
      subtitle={`${e.staffId} · personal, contact, KYC, payment, tax and work details. Changes apply at once; pay and job changes need approval.`}
      onClose={onClose}
      width={820}
      footer={
        <div className="hi-actions hi-edit-foot">
          <span className="hi-sub">{changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''}${sensitive.length ? ` · ${sensitive.length} sensitive` : ''}` : 'No changes yet'}</span>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save changes
          </button>
        </div>
      }
    >
      <div className="hi-edit">
        <h4 className="hi-h4">Personal</h4>
        <div className="pr-form-grid hi-edit-grid">
          <EF label="First name *" error={err('firstName')}>
            <input className={`form-control ${err('firstName') ? 'is-invalid' : ''}`} value={f.firstName} onChange={(ev) => set('firstName', ev.target.value)} />
          </EF>
          <EF label="Middle name">
            <input className="form-control" value={f.middleName} onChange={(ev) => set('middleName', ev.target.value)} />
          </EF>
          <EF label="Last name *" error={err('lastName')}>
            <input className={`form-control ${err('lastName') ? 'is-invalid' : ''}`} value={f.lastName} onChange={(ev) => set('lastName', ev.target.value)} />
          </EF>
          <EF label="Gender">
            <select className="form-control" value={f.gender} onChange={(ev) => set('gender', ev.target.value)}>
              <option value="">Not recorded</option>
              {['Female', 'Male', 'Other'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </EF>
          <EF label="Date of birth" error={err('dateOfBirth')}>
            <input className={`form-control ${err('dateOfBirth') ? 'is-invalid' : ''}`} type="date" max={today} value={f.dateOfBirth} onChange={(ev) => set('dateOfBirth', ev.target.value)} />
          </EF>
          <EF label="Marital status">
            <select className="form-control" value={f.maritalStatus} onChange={(ev) => set('maritalStatus', ev.target.value)}>
              <option value="">Not recorded</option>
              {['Single', 'Married', 'Divorced', 'Widowed'].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </EF>
          <EF label="Mobile phone *" error={err('phone')} hint="Used for SMS and the portal sign-in">
            <input className={`form-control ${err('phone') ? 'is-invalid' : ''}`} type="tel" placeholder="+254 712 345 678" value={f.phone} onChange={(ev) => set('phone', ev.target.value)} />
          </EF>
          <EF label="Personal email" error={err('personalEmail')}>
            <input className={`form-control ${err('personalEmail') ? 'is-invalid' : ''}`} type="email" value={f.personalEmail} onChange={(ev) => set('personalEmail', ev.target.value)} />
          </EF>
          <EF label="Home address" wide>
            <input className="form-control" value={f.address} onChange={(ev) => set('address', ev.target.value)} />
          </EF>
        </div>

        <h4 className="hi-h4">Next of kin & emergency contact</h4>
        <div className="pr-form-grid hi-edit-grid">
          <EF label="Next of kin" error={err('kinName')}>
            <input className={`form-control ${err('kinName') ? 'is-invalid' : ''}`} value={f.kinName} onChange={(ev) => set('kinName', ev.target.value)} />
          </EF>
          <EF label="Relationship">
            <input className="form-control" value={f.kinRelationship} onChange={(ev) => set('kinRelationship', ev.target.value)} />
          </EF>
          <EF label="Next of kin phone" error={err('kinPhone')}>
            <input className={`form-control ${err('kinPhone') ? 'is-invalid' : ''}`} type="tel" value={f.kinPhone} onChange={(ev) => set('kinPhone', ev.target.value)} />
          </EF>
          <EF label="Emergency contact" error={err('ecName')}>
            <input className={`form-control ${err('ecName') ? 'is-invalid' : ''}`} value={f.ecName} onChange={(ev) => set('ecName', ev.target.value)} />
          </EF>
          <EF label="Relationship">
            <input className="form-control" value={f.ecRelationship} onChange={(ev) => set('ecRelationship', ev.target.value)} />
          </EF>
          <EF label="Emergency phone" error={err('ecPhone')}>
            <input className={`form-control ${err('ecPhone') ? 'is-invalid' : ''}`} type="tel" value={f.ecPhone} onChange={(ev) => set('ecPhone', ev.target.value)} />
          </EF>
        </div>

        <h4 className="hi-h4">
          Statutory & KYC
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUnmask((x) => !x)}>
            {unmask ? <EyeOff size={13} /> : <Eye size={13} />} {unmask ? 'Mask' : 'Reveal'}
          </button>
        </h4>
        <div className="pr-note">
          <Lock size={13} /> Stored encrypted and kept masked. Type a full number only to replace it — leave blank to keep the one on file. Replacing a number needs a reason and is logged.
        </div>
        <div className="pr-form-grid hi-edit-grid">
          <EF label="National ID" error={err('nationalId')} hint={<>On file <b className="hi-mono">{reveal(e.nationalIdMasked, unmask)}</b></>}>
            <input className={`form-control ${err('nationalId') ? 'is-invalid' : ''}`} inputMode="numeric" autoComplete="off" placeholder="New ID (7–9 digits)" value={f.nationalId} onChange={(ev) => set('nationalId', ev.target.value.trim())} />
          </EF>
          <EF label="KRA PIN" error={err('kraPin')} hint={<>On file <b className="hi-mono">{reveal(e.kraPinMasked, unmask)}</b></>}>
            <input className={`form-control ${err('kraPin') ? 'is-invalid' : ''}`} autoComplete="off" placeholder="A123456789Z" maxLength={11} value={f.kraPin} onChange={(ev) => set('kraPin', ev.target.value.toUpperCase().trim())} />
          </EF>
          <EF label="NSSF number" error={err('nssfNo')} hint={<>On file <b className="hi-mono">{reveal(e.nssfNoMasked, unmask)}</b></>}>
            <input className={`form-control ${err('nssfNo') ? 'is-invalid' : ''}`} inputMode="numeric" autoComplete="off" placeholder="Digits only" value={f.nssfNo} onChange={(ev) => set('nssfNo', ev.target.value.trim())} />
          </EF>
          <EF label="SHIF number" error={err('shifNo')} hint={<>On file <b className="hi-mono">{reveal(e.shifNoMasked, unmask)}</b></>}>
            <input className={`form-control ${err('shifNo') ? 'is-invalid' : ''}`} autoComplete="off" placeholder="CR1234567890123-4" value={f.shifNo} onChange={(ev) => set('shifNo', ev.target.value.toUpperCase().trim())} />
          </EF>
        </div>

        <h4 className="hi-h4">Payment</h4>
        {casual ? (
          <div className="pr-note">Daily-rated staff are paid weekly by M-Pesa. Update the number below if it changed.</div>
        ) : (
          <div className="hi-seg" role="radiogroup" aria-label="Preferred pay rail">
            {(['BANK', 'MPESA'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={f.paymentMethod === m} className={f.paymentMethod === m ? 'active' : ''} onClick={() => set('paymentMethod', m)}>
                {m === 'BANK' ? 'Bank transfer' : 'M-Pesa'}
              </button>
            ))}
          </div>
        )}
        <div className="pr-form-grid hi-edit-grid">
          {f.paymentMethod === 'BANK' && !casual && (
            <>
              <EF label="Bank" error={err('bankName')}>
                <select className={`form-control ${err('bankName') ? 'is-invalid' : ''}`} value={f.bankName} onChange={(ev) => set('bankName', ev.target.value)}>
                  <option value="">Choose a bank</option>
                  {[...new Set([initial.bankName, ...KENYAN_BANKS].filter(Boolean))].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </EF>
              <EF label="Bank branch">
                <input className="form-control" value={f.bankBranch} onChange={(ev) => set('bankBranch', ev.target.value)} />
              </EF>
              <EF label="Account number" wide error={err('bankAccount')} hint={<>On file <b className="hi-mono">{reveal(e.bankAccountMasked, unmask)}</b> — leave blank to keep it</>}>
                <input className={`form-control ${err('bankAccount') ? 'is-invalid' : ''}`} inputMode="numeric" autoComplete="off" placeholder="New account number" value={f.bankAccount} onChange={(ev) => set('bankAccount', ev.target.value)} />
              </EF>
            </>
          )}
          <EF label={f.paymentMethod === 'MPESA' || casual ? 'M-Pesa number' : 'M-Pesa number (backup)'} error={err('mpesaNumber')} hint={<>On file <b className="hi-mono">{reveal(e.mpesaPhoneMasked, unmask)}</b> · format +2547XXXXXXXX</>}>
            <input className={`form-control ${err('mpesaNumber') ? 'is-invalid' : ''}`} type="tel" autoComplete="off" placeholder="+254712345678" value={f.mpesaNumber} onChange={(ev) => set('mpesaNumber', ev.target.value)} />
          </EF>
        </div>
        {(newBankMasked || newMpesaMasked) && (
          <div className="pr-note warn">
            Payroll will pay to {f.paymentMethod === 'MPESA' || casual ? `M-Pesa ${newMpesaMasked ?? e.mpesaPhoneMasked}` : newBankMasked ?? e.bankAccountMasked} from {payrollOpenPeriod.label}. Months already paid keep the old account.
          </div>
        )}

        <h4 className="hi-h4">Tax profile</h4>
        <div className="hi-seg" role="radiogroup" aria-label="Employment for tax purposes">
          {(['PRIMARY', 'SECONDARY'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={f.taxEmployment === m} className={f.taxEmployment === m ? 'active' : ''} onClick={() => set('taxEmployment', m)}>
              {m === 'PRIMARY' ? 'Primary employment' : 'Secondary employment'}
            </button>
          ))}
        </div>
        {f.taxEmployment === 'SECONDARY' && <div className="pr-note warn">Secondary employment: all taxable pay is taxed at the top PAYE rate and no personal relief is given.</div>}
        <div className="hi-checks">
          <label>
            <input type="checkbox" checked={f.pwdExempt} onChange={(ev) => set('pwdExempt', ev.target.checked)} /> Person with disability exemption
          </label>
          <label>
            <input type="checkbox" checked={f.taxExempt} onChange={(ev) => set('taxExempt', ev.target.checked)} /> Zero tax (pay without PAYE)
          </label>
        </div>
        {(f.pwdExempt || f.taxExempt) && (
          <div className="pr-form-grid hi-edit-grid">
            {f.pwdExempt && (
              <>
                <EF label="Exemption certificate no." error={err('pwdCertificateNo')}>
                  <input className={`form-control ${err('pwdCertificateNo') ? 'is-invalid' : ''}`} value={f.pwdCertificateNo} onChange={(ev) => set('pwdCertificateNo', ev.target.value)} />
                </EF>
                <EF label="Certificate expiry" error={err('pwdCertificateExpiry')}>
                  <input className={`form-control ${err('pwdCertificateExpiry') ? 'is-invalid' : ''}`} type="date" min={today} value={f.pwdCertificateExpiry} onChange={(ev) => set('pwdCertificateExpiry', ev.target.value)} />
                </EF>
                <EF label="Exempt amount (KES / month)" error={err('pwdExemptAmount')} hint={`Standard ${kes(DEFAULT_PWD_EXEMPT_AMOUNT)}`}>
                  <input className={`form-control ${err('pwdExemptAmount') ? 'is-invalid' : ''}`} type="number" min={0} value={f.pwdExemptAmount} onChange={(ev) => set('pwdExemptAmount', ev.target.value)} />
                </EF>
              </>
            )}
            {f.taxExempt && (
              <EF label="Reason for zero tax" error={err('taxExemptReason')} wide>
                <select className={`form-control ${err('taxExemptReason') ? 'is-invalid' : ''}`} value={f.taxExemptReason} onChange={(ev) => set('taxExemptReason', ev.target.value)}>
                  <option value="">Choose a reason</option>
                  {TAX_EXEMPT_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </EF>
            )}
          </div>
        )}

        <h4 className="hi-h4">Work details</h4>
        <div className="pr-form-grid hi-edit-grid">
          <EF label="Work email *" error={err('email')}>
            <input className={`form-control ${err('email') ? 'is-invalid' : ''}`} type="email" value={f.email} onChange={(ev) => set('email', ev.target.value)} />
          </EF>
          <EF label="Phone extension" error={err('phoneExtension')}>
            <input className={`form-control ${err('phoneExtension') ? 'is-invalid' : ''}`} inputMode="numeric" value={f.phoneExtension} onChange={(ev) => set('phoneExtension', ev.target.value)} />
          </EF>
          <EF label="Branch">
            <select
              className="form-control"
              value={f.branch}
              onChange={(ev) => {
                set('branch', ev.target.value);
                set('stationId', '');
              }}
            >
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </EF>
          <EF label="Station / site">
            <select className="form-control" value={f.stationId} onChange={(ev) => set('stationId', ev.target.value)}>
              <option value="">{stations.length ? 'None' : 'Single site'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </EF>
          <EF label="Block / section">
            <input className="form-control" value={f.block} onChange={(ev) => set('block', ev.target.value)} />
          </EF>
          <EF label="Cost centre">
            <input className="form-control" value={f.costCenter} onChange={(ev) => set('costCenter', ev.target.value)} />
          </EF>
          <EF label="Reports to" wide>
            <PersonSelect value={f.supervisor} onChange={(v) => set('supervisor', v)} people={supervisors} placeholder="No supervisor" />
          </EF>
        </div>

        <h4 className="hi-h4">Job & pay — approval needed</h4>
        <div className="pr-note">
          <Lock size={13} /> These change pay or the job, so they are changed through a request that a manager approves. Pay changes take effect from {payrollOpenPeriod.label} or later and are kept in the salary history.
        </div>
        <dl className="hi-dl hi-edit-ro">
          <dt>Job title</dt>
          <dd>{e.jobTitle}</dd>
          <dt>Grade</dt>
          <dd>{gradeOf(e)}</dd>
          <dt>Department</dt>
          <dd>{e.department}</dd>
          <dt>Contract</dt>
          <dd>{e.contractType}</dd>
          <dt>{casual ? 'Daily rate' : 'Basic salary'}</dt>
          <dd>{casual ? kes(e.payRateKes ?? 0) : `${kes(basic)} (${payrollOpenPeriod.label})`}</dd>
        </dl>
        {pending.length > 0 && <div className="pr-note warn">Already waiting: {pending.map((c) => `${CHANGE_LABEL[c.kind].toLowerCase()} (${c.id})`).join(', ')}.</div>}
        {!leaving && (
          <div className="hi-edit-req">
            {requests
              .filter((r) => r.show)
              .map((r) => (
                <button key={r.kind} type="button" className="btn btn-secondary btn-sm" onClick={() => onRequestChange(r.kind)}>
                  <r.icon size={13} /> {r.label}
                </button>
              ))}
          </div>
        )}

        <h4 className="hi-h4">Record the change</h4>
        {sensitive.length > 0 && (
          <div className="pr-note warn">
            <ShieldAlert size={13} /> Sensitive: {sensitive.map((c) => `${c.label} ${c.from} → ${c.to}`).join(' · ')}. These are flagged in the audit trail.
          </div>
        )}
        <div className="pr-form-grid hi-edit-grid">
          <EF label={`Reason${sensitive.length ? ' *' : ''}`} wide error={err('reason')} hint="Required for bank, M-Pesa, KRA PIN, national ID and tax changes">
            <textarea className={`form-control ${err('reason') ? 'is-invalid' : ''}`} rows={2} value={f.reason} onChange={(ev) => set('reason', ev.target.value)} placeholder="e.g. Employee moved salary account; letter from bank on file" />
          </EF>
          <EF label="Acting as" wide error={tried ? errs.actor : undefined} hint="HR user making the change; recorded in the history and audit trail">
            <PersonSelect value={actor} onChange={setActor} people={hrPeople} />
          </EF>
        </div>
      </div>
    </Modal>
  );
};
