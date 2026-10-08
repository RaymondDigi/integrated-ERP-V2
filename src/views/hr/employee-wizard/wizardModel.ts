import { emptyKin, kinErrors, kinFromDrafts, type KinDraft } from '../../../utils/nextOfKin';
import { workEmail } from '../../../data/hireEngine';
import { personalEmailError, workEmailError } from '../../../utils/emailRouting';
import type {
  ContractTypeDefinition,
  CustomFieldDefinition,
  CustomFieldValue,
  EmployeeAllowance,
  EmployeeFieldGroup,
  HREmployee,
  OrgStructure
} from '../../../types';
import { DEFAULT_PWD_EXEMPT_AMOUNT, DEFAULT_RETIREMENT_AGE, retirementDate } from '../../../utils/tax';

export type StepId = 'personal' | 'placement' | 'contract' | 'payment' | 'additional' | 'review';

export const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'personal', label: 'Personal details', hint: 'Name, identity & contacts' },
  { id: 'placement', label: 'Placement', hint: 'Branch, department & designation' },
  { id: 'contract', label: 'Contract', hint: 'Type, dates & terms' },
  { id: 'payment', label: 'Pay & payment', hint: 'Rate, allowances & account' },
  { id: 'additional', label: 'Additional info', hint: 'Custom fields' },
  { id: 'review', label: 'Review & create', hint: 'Check and confirm' }
];

export interface EmployeeForm {
  // Personal
  firstName: string;
  middleName: string;
  lastName: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  dateOfBirth: string;
  nationalId: string;
  kraPin: string;
  nssfNo: string;
  shifNo: string;
  maritalStatus: string;
  phone: string;
  /** Company address for sign-in and approvals; blank uses the suggested one */
  workEmail: string;
  personalEmail: string;
  /** Square photo as a data URL; optional */
  photoUrl: string;
  address: string;
  /** Next of kin — one or more, one primary */
  kins: KinDraft[];
  ecName: string;
  ecRelationship: string;
  ecPhone: string;
  phoneExtension: string;
  // Placement
  branchId: string;
  stationId: string;
  departmentId: string;
  sectionId: string;
  designationId: string;
  reportsToStaffId: string;
  // Contract
  contractType: string;
  staffId: string;
  startDate: string;
  endDate: string;
  probationMonths: string;
  noticeDays: string;
  workSchedule: string;
  retirementAge: string;
  leaveAnnualDays: string;
  leaveAccrual: 'MONTHLY' | 'UPFRONT';
  leaveDuringProbation: boolean;
  // Tax
  taxEmployment: 'PRIMARY' | 'SECONDARY';
  pwdExempt: boolean;
  pwdCertificateNo: string;
  pwdCertificateExpiry: string;
  pwdExemptAmount: string;
  taxExempt: boolean;
  taxExemptReason: string;
  // Payment
  payRate: string;
  allowances: { label: string; amount: string }[];
  paymentMethod: 'BANK' | 'MPESA';
  bankName: string;
  bankBranch: string;
  bankAccount: string;
  mpesaNumber: string;
  statutory: { paye: boolean; nssf: boolean; shif: boolean; ahl: boolean };
  // Custom
  custom: Record<string, CustomFieldValue>;
}

export const emptyForm = (staffId: string): EmployeeForm => ({
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  nationalId: '',
  kraPin: '',
  nssfNo: '',
  shifNo: '',
  maritalStatus: '',
  phone: '',
  workEmail: '',
  personalEmail: '',
  photoUrl: '',
  address: '',
  kins: [emptyKin(true)],
  ecName: '',
  ecRelationship: '',
  ecPhone: '',
  phoneExtension: '',
  branchId: '',
  stationId: '',
  departmentId: '',
  sectionId: '',
  designationId: '',
  reportsToStaffId: '',
  contractType: '',
  staffId,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  probationMonths: '3',
  noticeDays: '30',
  workSchedule: 'Mon–Fri, 8:00–17:00',
  retirementAge: String(DEFAULT_RETIREMENT_AGE),
  leaveAnnualDays: '21',
  leaveAccrual: 'MONTHLY',
  leaveDuringProbation: false,
  taxEmployment: 'PRIMARY',
  pwdExempt: false,
  pwdCertificateNo: '',
  pwdCertificateExpiry: '',
  pwdExemptAmount: String(DEFAULT_PWD_EXEMPT_AMOUNT),
  taxExempt: false,
  taxExemptReason: '',
  payRate: '',
  allowances: [],
  paymentMethod: 'BANK',
  bankName: '',
  bankBranch: '',
  bankAccount: '',
  mpesaNumber: '',
  statutory: { paye: true, nssf: true, shif: true, ahl: true },
  custom: {}
});

/** Next free staff ID using the most common prefix in the roster, e.g. KHE-1022. */
export const nextStaffId = (employees: HREmployee[]) => {
  const nums = employees.map((e) => e.staffId.match(/^([A-Z]+)-(\d+)$/)).filter(Boolean) as RegExpMatchArray[];
  const prefix = nums[0]?.[1] ?? 'EMP';
  const max = nums.filter((m) => m[1] === prefix).reduce((m, x) => Math.max(m, Number(x[2])), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

export const PAY_BASIS_LABEL: Record<ContractTypeDefinition['payBasis'], { field: string; unit: string }> = {
  MONTHLY_SALARY: { field: 'Basic salary', unit: 'KES / month' },
  DAILY_RATE: { field: 'Daily rate', unit: 'KES / day' },
  OUTPUT_RATE: { field: 'Rate per unit', unit: 'KES / unit' }
};

const PHONE_RE = /^\+?[\d\s]{9,16}$/;
const KRA_RE = /^[AP]\d{9}[A-Z]$/i;

export type Errors = Partial<Record<string, string>>;

const age = (dob: string) => {
  const d = new Date(dob + 'T00:00:00');
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a;
};

const customErrors = (group: EmployeeFieldGroup, form: EmployeeForm, fields: CustomFieldDefinition[], errs: Errors) => {
  fields
    .filter((f) => f.group === group && f.required)
    .forEach((f) => {
      const v = form.custom[f.id];
      if (v === undefined || v === '' || (f.type === 'checkbox' && v !== true)) errs[`cf:${f.id}`] = `${f.label} is required`;
    });
};

export const validateStep = (
  step: StepId,
  form: EmployeeForm,
  ctx: { contractTypes: ContractTypeDefinition[]; customFields: CustomFieldDefinition[]; employees: HREmployee[]; editing?: HREmployee; initial?: EmployeeForm }
): Errors => {
  // Editing: job, pay and contract terms are locked (changed through approved requests); masked numbers left blank stay on file
  const ed = ctx.editing;
  const others = ed ? ctx.employees.filter((x) => x.staffId !== ed.staffId) : ctx.employees;
  const e: Errors = {};
  const req = (k: keyof EmployeeForm, label: string) => {
    if (!String(form[k] ?? '').trim()) e[k] = `${label} is required`;
  };

  if (step === 'personal') {
    req('firstName', 'First name');
    req('lastName', 'Last name');
    // Older records may lack these; editing does not force them to be filled
    if (!ed || ed.gender) req('gender', 'Gender');
    if (!ed || ed.dateOfBirth) req('dateOfBirth', 'Date of birth');
    if (!ed) req('nationalId', 'National ID / passport');
    req('phone', 'Mobile number');
    if (form.dateOfBirth && age(form.dateOfBirth) < 18) e.dateOfBirth = 'Employee must be at least 18 years old';
    if (form.nationalId && !/^[A-Z0-9]{6,10}$/i.test(form.nationalId.trim())) e.nationalId = 'Use 6–10 letters or digits';
    const digits = (v: string) => v.replace(/\D/g, '').slice(-9);
    if (form.phone && others.some((x) => digits(x.phone) === digits(form.phone)))
      e.phoneWarn = 'Another employee already uses this mobile number — check this is not a duplicate record';
    if (form.phone && !PHONE_RE.test(form.phone.trim())) e.phone = 'Use a format like +254 712 345 678';
    const pe = personalEmailError(form.personalEmail);
    if (pe) e.personalEmail = pe;
    const we = form.workEmail.trim() || ed ? workEmailError(form.workEmail, ed?.staffId, ctx.employees) : '';
    if (we) e.workEmail = we;
    if (form.kraPin && !KRA_RE.test(form.kraPin.trim())) e.kraPin = 'KRA PIN looks like A123456789B';
    Object.assign(e, kinErrors(form.kins ?? []));
    if ((form.ecRelationship || form.ecPhone) && !form.ecName.trim()) e.ecName = 'Name the emergency contact';
    if (form.ecName.trim() && !form.ecPhone.trim()) e.ecPhone = 'A phone number is needed for emergencies';
    else if (form.ecPhone.trim() && !PHONE_RE.test(form.ecPhone.trim())) e.ecPhone = 'Check the number';
    if (form.phoneExtension.trim() && !/^\d{2,6}$/.test(form.phoneExtension.trim())) e.phoneExtension = '2–6 digits';
    customErrors('personal', form, ctx.customFields, e);
  }

  if (step === 'placement') {
    if (!(ed && ed.branch)) req('branchId', 'Branch');
    if (!ed) {
      req('departmentId', 'Department');
      req('designationId', 'Designation');
    }
    customErrors('placement', form, ctx.customFields, e);
  }

  if (step === 'contract' && !ed) {
    req('contractType', 'Contract type');
    req('staffId', 'Staff ID');
    req('startDate', 'Start date');
    const ct = ctx.contractTypes.find((c) => c.name === form.contractType);
    if (ct?.hasEndDate && !form.endDate) e.endDate = 'This contract type needs an end date';
    if (ct && !ct.hasEndDate) {
      const ra = Number(form.retirementAge);
      if (!(ra >= 50 && ra <= 75)) e.retirementAge = 'Retirement age must be between 50 and 75';
      const rd = retirementDate(form.dateOfBirth, ra);
      if (rd && form.startDate && rd <= form.startDate) e.retirementAge = 'This employee would already be past retirement age on the start date';
    }
    const ld = Number(form.leaveAnnualDays);
    if (form.leaveAnnualDays === '' || isNaN(ld) || ld < 0 || ld > 60) e.leaveAnnualDays = 'Enter 0–60 days';
    else if (ld < 21) e.leaveAnnualDaysWarn = 'Below the statutory minimum of 21 working days per year';
    if (form.endDate && form.startDate && form.endDate <= form.startDate) e.endDate = 'End date must be after the start date';
    if (form.staffId && ctx.employees.some((x) => x.staffId.toLowerCase() === form.staffId.trim().toLowerCase())) e.staffId = 'This staff ID is already used';
    const p = Number(form.probationMonths);
    if (form.probationMonths && (isNaN(p) || p < 0 || p > 12)) e.probationMonths = '0–12 months';
  }
  if (step === 'contract') {
    if (ed) {
      const ld = Number(form.leaveAnnualDays);
      if (form.leaveAnnualDays === '' || isNaN(ld) || ld < 0 || ld > 60) e.leaveAnnualDays = 'Enter 0–60 days';
      else if (ld < 21) e.leaveAnnualDaysWarn = 'Below the statutory minimum of 21 working days per year';
    }
    if (form.noticeDays && !(Number(form.noticeDays) >= 0)) e.noticeDays = 'Enter the number of days';
    customErrors('contract', form, ctx.customFields, e);
  }

  if (step === 'payment') {
    if (!ed) {
      if (!(Number(form.payRate) > 0)) e.payRate = 'Enter an amount greater than zero';
      form.allowances.forEach((a, i) => {
        if (!a.label.trim()) e[`allow:${i}`] = 'Name the allowance';
        else if (!(Number(a.amount) > 0)) e[`allow:${i}`] = 'Enter an amount';
      });
    }
    const onFile = (v?: string) => !!v && v !== '—';
    if (form.paymentMethod === 'BANK') {
      req('bankName', 'Bank');
      // Editing: a blank account keeps the one on file, unless the bank changed
      const bankChanged = !!ed && form.bankName !== (ctx.initial?.bankName ?? '');
      if (!ed || bankChanged || !onFile(ed.bankAccountMasked)) {
        if (!form.bankAccount.trim()) e.bankAccount = bankChanged ? 'Enter the account number at the new bank' : 'Account number is required';
      }
      if (form.bankAccount && !/^\d{6,16}$/.test(form.bankAccount.replace(/\s/g, ''))) e.bankAccount = 'Digits only, 6–16 long';
    } else {
      if (!ed || !onFile(ed.mpesaPhoneMasked)) req('mpesaNumber', 'M-Pesa number');
      if (form.mpesaNumber && !/^(\+?254|0)7\d{8}$/.test(form.mpesaNumber.replace(/\s/g, ''))) e.mpesaNumber = 'Use a Safaricom number, e.g. 0712 345 678';
    }
    if (form.pwdExempt && !form.taxExempt) {
      req('pwdCertificateNo', 'Exemption certificate number');
      if (!form.pwdCertificateExpiry) e.pwdCertificateExpiry = 'Certificate expiry date is required';
      else if (form.pwdCertificateExpiry < new Date().toISOString().slice(0, 10)) e.pwdCertificateExpiry = 'This certificate has expired';
      if (!(Number(form.pwdExemptAmount) > 0)) e.pwdExemptAmount = 'Enter the exempt amount';
    }
    if (form.taxExempt) req('taxExemptReason', 'Reason for zero tax');
    customErrors('payment', form, ctx.customFields, e);
  }

  if (step === 'additional') customErrors('additional', form, ctx.customFields, e);

  return e;
};

/** Errors that block moving on (warnings end in "Warn"). */
export const blockingErrors = (e: Errors) => Object.keys(e).filter((k) => !k.endsWith('Warn'));

const mask = (v: string, keepStart = 2, keepEnd = 1) =>
  v.length <= keepStart + keepEnd ? v : `${v.slice(0, keepStart)}${'*'.repeat(Math.max(3, v.length - keepStart - keepEnd))}${v.slice(-keepEnd)}`;

/** The company address a new employee gets: initial.surname, numbered when someone already has it. */
export const suggestWorkEmail = (form: Pick<EmployeeForm, 'firstName' | 'middleName' | 'lastName' | 'contractType'>, contractTypes: ContractTypeDefinition[], employees: HREmployee[]) => {
  const fullName = [form.firstName, form.middleName, form.lastName].map((x) => x.trim()).filter(Boolean).join(' ');
  if (!fullName) return '';
  const daily = contractTypes.find((c) => c.name === form.contractType)?.payBasis === 'DAILY_RATE';
  const base = workEmail(fullName, daily);
  const taken = new Set(employees.map((e) => (e.email ?? '').toLowerCase()));
  if (!taken.has(base)) return base;
  const [local, domain] = base.split('@');
  let n = 2;
  while (taken.has(`${local}${n}@${domain}`)) n++;
  return `${local}${n}@${domain}`;
};

export const buildEmployee = (form: EmployeeForm, org: OrgStructure, contractTypes: ContractTypeDefinition[], employees: HREmployee[] = []): Omit<HREmployee, 'id' | 'orgId'> => {
  const branch = org.branches.find((b) => b.id === form.branchId);
  const dept = org.departments.find((d) => d.id === form.departmentId);
  const station = org.stations.find((s) => s.id === form.stationId);
  const section = org.sections.find((s) => s.id === form.sectionId);
  const desig = org.designations.find((d) => d.id === form.designationId);
  const ct = contractTypes.find((c) => c.name === form.contractType);
  const rate = Number(form.payRate);
  const allowances: EmployeeAllowance[] = form.allowances.map((a) => ({ label: a.label.trim(), amount: Number(a.amount) }));
  const fullName = [form.firstName, form.middleName, form.lastName].map((x) => x.trim()).filter(Boolean).join(' ');
  const account = form.bankAccount.replace(/\s/g, '');

  return {
    staffId: form.staffId.trim().toUpperCase(),
    fullName,
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim() || undefined,
    lastName: form.lastName.trim(),
    gender: form.gender || undefined,
    dateOfBirth: form.dateOfBirth,
    maritalStatus: form.maritalStatus || undefined,
    email: (form.workEmail.trim() || suggestWorkEmail(form, contractTypes, employees)).toLowerCase(),
    personalEmail: form.personalEmail.trim() || undefined,
    photoUrl: form.photoUrl || undefined,
    phone: form.phone.trim(),
    address: form.address.trim() || undefined,
    ...kinFromDrafts(form.kins ?? []),
    emergencyContact: form.ecName.trim() ? { name: form.ecName.trim(), relationship: form.ecRelationship.trim(), phone: form.ecPhone.trim() } : undefined,
    phoneExtension: form.phoneExtension.trim() || undefined,
    nationalIdMasked: mask(form.nationalId.trim()),
    kraPinMasked: form.kraPin ? mask(form.kraPin.trim().toUpperCase(), 3, 2) : '—',
    nssfNoMasked: form.nssfNo ? mask(form.nssfNo.trim(), 3, 1) : '—',
    shifNoMasked: form.shifNo ? mask(form.shifNo.trim(), 3, 2) : '—',
    bankAccountMasked: form.paymentMethod === 'BANK' ? `${form.bankName} ${mask(account, 2, 3)}` : '—',
    mpesaPhoneMasked: form.paymentMethod === 'MPESA' ? mask(form.mpesaNumber.replace(/\s/g, ''), 4, 3) : '—',
    contractType: form.contractType,
    department: dept?.name ?? '',
    branch: branch?.name ?? '',
    block: [station?.name, section?.name].filter(Boolean).join(' · ') || undefined,
    jobTitle: desig?.title ?? '',
    basicSalaryKes: ct?.payBasis === 'MONTHLY_SALARY' ? rate : 0,
    pieceRatePerUnitKes: ct?.payBasis === 'MONTHLY_SALARY' ? undefined : rate,
    joinedDate: form.startDate,
    status: 'ACTIVE',
    branchId: form.branchId,
    stationId: form.stationId || undefined,
    departmentId: form.departmentId,
    sectionId: form.sectionId || undefined,
    designationId: form.designationId,
    costCenter: dept?.costCenter,
    reportsToStaffId: form.reportsToStaffId || undefined,
    contractStartDate: form.startDate,
    contractEndDate: ct?.hasEndDate ? form.endDate || undefined : undefined,
    retirementAge: ct && !ct.hasEndDate ? Number(form.retirementAge) : undefined,
    retirementDate: ct && !ct.hasEndDate ? retirementDate(form.dateOfBirth, Number(form.retirementAge)) || undefined : undefined,
    leavePolicy: {
      annualDays: Number(form.leaveAnnualDays),
      accrual: form.leaveAccrual,
      eligibleAfterProbation: !form.leaveDuringProbation
    },
    tax: {
      employment: form.taxEmployment,
      pwdExempt: form.pwdExempt,
      pwdCertificateNo: form.pwdExempt ? form.pwdCertificateNo.trim() : undefined,
      pwdCertificateExpiry: form.pwdExempt ? form.pwdCertificateExpiry : undefined,
      pwdExemptAmount: form.pwdExempt ? Number(form.pwdExemptAmount) : undefined,
      taxExempt: form.taxExempt,
      taxExemptReason: form.taxExempt ? form.taxExemptReason : undefined
    },
    probationMonths: Number(form.probationMonths) || 0,
    noticeDays: Number(form.noticeDays) || undefined,
    workSchedule: form.workSchedule.trim() || undefined,
    payRateKes: rate,
    allowances,
    paymentMethod: form.paymentMethod,
    bankName: form.paymentMethod === 'BANK' ? form.bankName : undefined,
    bankBranch: form.paymentMethod === 'BANK' ? form.bankBranch.trim() || undefined : undefined,
    statutory: { ...form.statutory, paye: !form.taxExempt },
    customFields: form.custom
  };
};
