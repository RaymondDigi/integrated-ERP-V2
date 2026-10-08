import type { CustomFieldDefinition, HREmployee, OrgStructure } from '../../../types';
import { KENYAN_BANKS } from '../../../data/orgData';
import { basicFor, isCasual } from '../../../data/payrollEngine';
import { supervisorFor } from '../../../data/leaveConfig';
import { maskAccount, maskId, maskKra, maskNssf, maskPhone, maskShif } from '../../../data/hireEngine';
import { DEFAULT_PWD_EXEMPT_AMOUNT, DEFAULT_RETIREMENT_AGE } from '../../../utils/tax';
import { kinDraftsOf, kinFromDrafts, kinSummary } from '../../../utils/nextOfKin';
import type { EmployeeForm } from './wizardModel';

/**
 * Editing an employee in the same screens used to add one. The record is loaded into the wizard form;
 * masked numbers (ID, KRA PIN, NSSF, SHIF, bank, M-Pesa) start blank and are kept unless a new one is typed.
 * Job, pay and contract terms are shown read-only and change through approved requests.
 */

export interface EditChange {
  label: string;
  from: string;
  to: string;
  sensitive?: boolean;
}

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

const byName = <T extends { id: string }>(list: T[], key: (x: T) => string, name?: string) => (name ? list.find((x) => key(x).toLowerCase() === name.toLowerCase())?.id ?? '' : '');

export const formFromEmployee = (e: HREmployee, org: OrgStructure, all: HREmployee[], openPeriod: { year: number; month: number }): EmployeeForm => {
  const casual = isCasual(e);
  return {
    ...splitName(e),
    gender: (e.gender ?? '') as EmployeeForm['gender'],
    dateOfBirth: e.dateOfBirth ?? '',
    nationalId: '',
    kraPin: '',
    nssfNo: '',
    shifNo: '',
    maritalStatus: e.maritalStatus ?? '',
    phone: e.phone ?? '',
    workEmail: e.email ?? '',
    personalEmail: e.personalEmail ?? '',
    photoUrl: e.photoUrl ?? '',
    address: e.address ?? '',
    kins: kinDraftsOf(e),
    ecName: e.emergencyContact?.name ?? '',
    ecRelationship: e.emergencyContact?.relationship ?? '',
    ecPhone: e.emergencyContact?.phone ?? '',
    phoneExtension: e.phoneExtension ?? '',
    branchId: e.branchId ?? byName(org.branches, (b) => b.name, e.branch),
    stationId: e.stationId ?? '',
    departmentId: e.departmentId ?? byName(org.departments, (d) => d.name, e.department),
    sectionId: e.sectionId ?? '',
    designationId: e.designationId ?? byName(org.designations, (d) => d.title, e.jobTitle),
    reportsToStaffId: e.reportsToStaffId ?? supervisorFor(e, all)?.staffId ?? '',
    contractType: e.contractType,
    staffId: e.staffId,
    startDate: e.contractStartDate ?? e.joinedDate,
    endDate: e.contractEndDate ?? '',
    probationMonths: String(e.probationMonths ?? 0),
    noticeDays: e.noticeDays !== undefined ? String(e.noticeDays) : '30',
    workSchedule: e.workSchedule ?? 'Mon–Fri, 8:00–17:00',
    retirementAge: String(e.retirementAge ?? DEFAULT_RETIREMENT_AGE),
    leaveAnnualDays: String(e.leavePolicy?.annualDays ?? 21),
    leaveAccrual: e.leavePolicy?.accrual ?? 'MONTHLY',
    leaveDuringProbation: e.leavePolicy ? !e.leavePolicy.eligibleAfterProbation : false,
    taxEmployment: e.tax?.employment ?? 'PRIMARY',
    pwdExempt: !!e.tax?.pwdExempt,
    pwdCertificateNo: e.tax?.pwdCertificateNo ?? '',
    pwdCertificateExpiry: e.tax?.pwdCertificateExpiry ?? '',
    pwdExemptAmount: String(e.tax?.pwdExemptAmount ?? DEFAULT_PWD_EXEMPT_AMOUNT),
    taxExempt: !!e.tax?.taxExempt,
    taxExemptReason: e.tax?.taxExemptReason ?? '',
    payRate: String(casual ? e.payRateKes ?? 0 : basicFor(e, openPeriod.year, openPeriod.month)),
    allowances: (e.allowances ?? []).map((a) => ({ label: a.label, amount: String(a.amount) })),
    paymentMethod: casual || e.paymentMethod === 'MPESA' ? 'MPESA' : 'BANK',
    bankName: bankOf(e),
    bankBranch: e.bankBranch ?? '',
    bankAccount: '',
    mpesaNumber: '',
    statutory: e.statutory ?? { paye: !e.tax?.taxExempt, nssf: true, shif: true, ahl: true },
    custom: e.customFields ?? {}
  };
};

const taxLabel = (f: EmployeeForm) =>
  [
    f.taxEmployment === 'SECONDARY' ? 'Secondary' : 'Primary',
    f.pwdExempt ? `PWD exempt (cert ${f.pwdCertificateNo || '—'}, KES ${Number(f.pwdExemptAmount || 0).toLocaleString()}, to ${f.pwdCertificateExpiry || '—'})` : '',
    f.taxExempt ? `zero tax (${f.taxExemptReason || '—'})` : ''
  ]
    .filter(Boolean)
    .join(', ');

const contact = (n: string, r: string, p: string) => (n.trim() ? `${n.trim()} (${r.trim() || '—'}) ${p.trim()}` : '');
const fullNameOf = (f: EmployeeForm) => [f.firstName, f.middleName, f.lastName].map((x) => x.trim()).filter(Boolean).join(' ');
const showCustom = (v: unknown) => (v === undefined || v === '' ? '' : v === true ? 'Yes' : v === false ? 'No' : String(v));

/** What changed between the loaded record and the form, and the record patch that applies it. */
export const diffEmployee = (e: HREmployee, initial: EmployeeForm, f: EmployeeForm, ctx: { org: OrgStructure; employees: HREmployee[]; customFields: CustomFieldDefinition[] }) => {
  const changes: EditChange[] = [];
  const patch: Partial<HREmployee> = {};
  const cmp = (label: string, from: string, to: string, apply: () => void, sensitive = false) => {
    if (from !== to) {
      changes.push({ label, from: from || '—', to: to || '—', sensitive });
      apply();
    }
  };
  const { org } = ctx;
  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '';
  const person = (id: string) => ctx.employees.find((x) => x.staffId === id)?.fullName ?? '';
  const casual = isCasual(e);

  // Personal
  const fullName = fullNameOf(f);
  cmp('name', fullNameOf(initial), fullName, () => Object.assign(patch, { fullName, firstName: f.firstName.trim(), middleName: f.middleName.trim() || undefined, lastName: f.lastName.trim() }));
  cmp('gender', initial.gender, f.gender, () => (patch.gender = (f.gender || undefined) as HREmployee['gender']));
  cmp('date of birth', initial.dateOfBirth, f.dateOfBirth, () => (patch.dateOfBirth = f.dateOfBirth || undefined));
  cmp('marital status', initial.maritalStatus, f.maritalStatus, () => (patch.maritalStatus = f.maritalStatus || undefined));
  if (initial.photoUrl !== f.photoUrl) {
    changes.push({ label: 'photo', from: initial.photoUrl ? 'on file' : '—', to: f.photoUrl ? (initial.photoUrl ? 'new photo' : 'added') : 'removed' });
    patch.photoUrl = f.photoUrl || undefined;
  }
  // Statutory numbers: only when a new one is typed
  if (f.nationalId.trim()) cmp('national ID', e.nationalIdMasked, maskId(f.nationalId.trim()), () => (patch.nationalIdMasked = maskId(f.nationalId.trim())), true);
  if (f.kraPin.trim()) cmp('KRA PIN', e.kraPinMasked, maskKra(f.kraPin.trim()), () => (patch.kraPinMasked = maskKra(f.kraPin.trim())), true);
  if (f.nssfNo.trim()) cmp('NSSF number', e.nssfNoMasked, maskNssf(f.nssfNo.trim()), () => (patch.nssfNoMasked = maskNssf(f.nssfNo.trim())), true);
  if (f.shifNo.trim()) cmp('SHIF number', e.shifNoMasked, maskShif(f.shifNo.trim()), () => (patch.shifNoMasked = maskShif(f.shifNo.trim())), true);
  // Contact
  cmp('phone', initial.phone.trim(), f.phone.trim(), () => (patch.phone = f.phone.trim()));
  // The work email signs in and receives approvals, so a change needs a reason
  cmp('work email', initial.workEmail.trim().toLowerCase(), f.workEmail.trim().toLowerCase(), () => (patch.email = f.workEmail.trim().toLowerCase()), true);
  cmp('personal email', initial.personalEmail.trim(), f.personalEmail.trim(), () => (patch.personalEmail = f.personalEmail.trim() || undefined));
  cmp('phone extension', initial.phoneExtension.trim(), f.phoneExtension.trim(), () => (patch.phoneExtension = f.phoneExtension.trim() || undefined));
  cmp('address', initial.address.trim(), f.address.trim(), () => (patch.address = f.address.trim() || undefined));
  const kinBefore = kinSummary(kinFromDrafts(initial.kins).nextOfKins ?? []);
  const kin = kinFromDrafts(f.kins);
  cmp('next of kin', kinBefore, kinSummary(kin.nextOfKins ?? []), () => Object.assign(patch, kin));
  cmp('emergency contact', contact(initial.ecName, initial.ecRelationship, initial.ecPhone), contact(f.ecName, f.ecRelationship, f.ecPhone), () => {
    patch.emergencyContact = f.ecName.trim() ? { name: f.ecName.trim(), relationship: f.ecRelationship.trim(), phone: f.ecPhone.trim() } : undefined;
  });

  // Placement (department and designation change through a transfer or promotion)
  if (f.branchId) cmp('branch', nameOf(org.branches, initial.branchId) || e.branch, nameOf(org.branches, f.branchId), () => Object.assign(patch, { branch: nameOf(org.branches, f.branchId), branchId: f.branchId }));
  const stationName = (id: string) => org.stations.find((s) => s.id === id)?.name ?? '';
  const sectionName = (id: string) => org.sections.find((s) => s.id === id)?.name ?? '';
  const siteChanged = initial.stationId !== f.stationId || initial.sectionId !== f.sectionId;
  cmp('station', stationName(initial.stationId), stationName(f.stationId), () => (patch.stationId = f.stationId || undefined));
  cmp('section', sectionName(initial.sectionId), sectionName(f.sectionId), () => (patch.sectionId = f.sectionId || undefined));
  if (siteChanged) patch.block = [stationName(f.stationId), sectionName(f.sectionId)].filter(Boolean).join(' · ') || undefined;
  cmp('reports to', person(initial.reportsToStaffId), person(f.reportsToStaffId), () => (patch.reportsToStaffId = f.reportsToStaffId || undefined));

  // Working terms that do not change pay
  cmp('notice period', initial.noticeDays ? `${initial.noticeDays} days` : '', f.noticeDays ? `${f.noticeDays} days` : '', () => (patch.noticeDays = Number(f.noticeDays) || undefined));
  cmp('work schedule', initial.workSchedule.trim(), f.workSchedule.trim(), () => (patch.workSchedule = f.workSchedule.trim() || undefined));
  const leave = (x: EmployeeForm) => `${x.leaveAnnualDays} days, ${x.leaveAccrual === 'MONTHLY' ? 'monthly' : 'up front'}${x.leaveDuringProbation ? ', during probation' : ''}`;
  cmp('leave entitlement', leave(initial), leave(f), () => (patch.leavePolicy = { annualDays: Number(f.leaveAnnualDays), accrual: f.leaveAccrual, eligibleAfterProbation: !f.leaveDuringProbation }), true);

  // Tax and statutory
  if (taxLabel(initial) !== taxLabel(f)) {
    changes.push({ label: 'tax profile', from: taxLabel(initial), to: taxLabel(f), sensitive: true });
    patch.tax = {
      employment: f.taxEmployment,
      pwdExempt: f.pwdExempt,
      pwdCertificateNo: f.pwdExempt ? f.pwdCertificateNo.trim() : undefined,
      pwdCertificateExpiry: f.pwdExempt ? f.pwdCertificateExpiry : undefined,
      pwdExemptAmount: f.pwdExempt ? Number(f.pwdExemptAmount) : undefined,
      taxExempt: f.taxExempt,
      taxExemptReason: f.taxExempt ? f.taxExemptReason : undefined
    };
  }
  const stat = (x: EmployeeForm) => (['nssf', 'shif', 'ahl'] as const).filter((k) => x.statutory[k]).map((k) => k.toUpperCase()).join(', ') || 'none';
  const statChanged = stat(initial) !== stat(f) || initial.taxExempt !== f.taxExempt;
  if (stat(initial) !== stat(f)) changes.push({ label: 'statutory deductions', from: stat(initial), to: stat(f), sensitive: true });
  if (statChanged) patch.statutory = { ...f.statutory, paye: !f.taxExempt };

  // Payment
  if (!casual) cmp('pay rail', initial.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Bank', f.paymentMethod === 'MPESA' ? 'M-Pesa' : 'Bank', () => (patch.paymentMethod = f.paymentMethod), true);
  const account = f.bankAccount.replace(/\s/g, '');
  if (f.paymentMethod === 'BANK' && account) cmp('bank account', e.bankAccountMasked, maskAccount(f.bankName, account), () => Object.assign(patch, { bankAccountMasked: maskAccount(f.bankName, account), bankName: f.bankName }), true);
  else if (f.paymentMethod === 'BANK') cmp('bank', initial.bankName, f.bankName, () => (patch.bankName = f.bankName), true);
  if (f.paymentMethod === 'BANK') cmp('bank branch', initial.bankBranch.trim(), f.bankBranch.trim(), () => (patch.bankBranch = f.bankBranch.trim() || undefined), true);
  const mpesa = f.mpesaNumber.replace(/\s/g, '');
  if (mpesa) cmp('M-Pesa number', e.mpesaPhoneMasked, maskPhone(mpesa), () => (patch.mpesaPhoneMasked = maskPhone(mpesa)), true);

  // Company custom fields
  const ids = new Set([...Object.keys(initial.custom), ...Object.keys(f.custom)]);
  let customChanged = false;
  ids.forEach((id) => {
    const label = ctx.customFields.find((c) => c.id === id)?.label ?? id;
    cmp(label, showCustom(initial.custom[id]), showCustom(f.custom[id]), () => (customChanged = true));
  });
  if (customChanged) patch.customFields = f.custom;

  return { changes, patch, sensitive: changes.filter((c) => c.sensitive) };
};
