import type { OrgSettings, RoundingDirection, RoundingStep, TenantOrganization } from '../types';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const INDUSTRIES = [
  'Agriculture & Agro-processing',
  'Manufacturing',
  'Financial Services',
  'Healthcare',
  'Education',
  'Retail & Distribution',
  'Hospitality',
  'Technology',
  'Construction & Real Estate',
  'Logistics & Transport',
  'Non-profit',
  'Public Sector',
  'Professional Services'
];

const PALETTE = ['#237857', '#2563eb', '#7c3aed', '#c2410c', '#0f766e', '#be123c', '#4d7c0f', '#0369a1'];

/** Sensible Kenyan defaults for a new or existing company. */
export const defaultOrgSettings = (org?: Partial<TenantOrganization>, index = 0): OrgSettings => ({
  status: 'ACTIVE',
  legalName: org?.name ?? '',
  displayName: org?.name?.replace(/\s+(Ltd|Limited|PLC)\.?$/i, '') ?? '',
  brandColor: PALETTE[index % PALETTE.length],
  industry: '',
  kraPin: '',
  businessRegNo: '',
  nssfEmployerNo: '',
  shifEmployerNo: '',
  housingLevyNo: '',
  nitaNo: '',
  physicalAddress: org?.location ?? '',
  postalAddress: '',
  phone: '',
  email: '',
  website: '',
  periodType: 'CALENDAR',
  fyStartMonth: 7,
  activeYear: new Date().getFullYear(),
  payDay: 25,
  cutOffDay: 20,
  overtime: {
    enabled: true,
    weekdayRate: 1.5,
    restDayRate: 2,
    holidayRate: 2,
    basis: 'BASIC',
    standardMonthlyHours: 225,
    maxHoursPerMonth: 60,
    minimumBlockMinutes: 30,
    requiresApproval: true
  },
  probation: { defaultMonths: 3, maxMonths: 12, allowExtension: true, noticeDays: 7, reminderDays: 14 },
  retirement: { normalAge: 60, earlyAge: 50, pwdAge: 65, reminderMonths: 6 },
  leave: { annualDays: 21, carryOverMax: 5, sickFullPayDays: 7, sickHalfPayDays: 7, maternityDays: 90, paternityDays: 14, compassionateDays: 5 },
  rounding: { netPayStep: 0, netPayDirection: 'NEAREST', carryForward: true, taxRounding: 'NEAREST', showDecimals: false }
});

/** Settings with defaults filled in for older records. */
export const settingsFor = (org: TenantOrganization, index = 0): OrgSettings => ({ ...defaultOrgSettings(org, index), ...org.settings } as OrgSettings);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface ActivePeriod {
  label: string;
  start: string;
  end: string;
  months: { label: string; start: string; end: string; payDate: string; cutOff: string }[];
}

/** The 12-month active period (calendar or financial year) and its payroll months. */
export const activePeriodFor = (s: Pick<OrgSettings, 'periodType' | 'fyStartMonth' | 'activeYear' | 'payDay' | 'cutOffDay'>): ActivePeriod => {
  const startMonth = s.periodType === 'CALENDAR' ? 0 : s.fyStartMonth - 1;
  const start = new Date(s.activeYear, startMonth, 1);
  const end = new Date(s.activeYear, startMonth + 12, 0);
  const label =
    s.periodType === 'CALENDAR'
      ? `Calendar year ${s.activeYear}`
      : startMonth === 0
        ? `Financial year ${s.activeYear}`
        : `Financial year ${s.activeYear}/${String((s.activeYear + 1) % 100).padStart(2, '0')}`;
  const months = Array.from({ length: 12 }, (_, i) => {
    const mStart = new Date(s.activeYear, startMonth + i, 1);
    const mEnd = new Date(s.activeYear, startMonth + i + 1, 0);
    const day = (d: number) => new Date(mStart.getFullYear(), mStart.getMonth(), Math.min(d, mEnd.getDate()));
    return {
      label: `${MONTH_NAMES[mStart.getMonth()].slice(0, 3)} ${mStart.getFullYear()}`,
      start: iso(mStart),
      end: iso(mEnd),
      payDate: iso(day(s.payDay)),
      cutOff: iso(day(s.cutOffDay))
    };
  });
  return { label, start: iso(start), end: iso(end), months };
};

/** Rounds net pay to the configured step; returns the paid amount and the adjustment. */
export const roundNetPay = (amount: number, step: RoundingStep, direction: RoundingDirection) => {
  if (!step) return { paid: Math.round(amount * 100) / 100, adjustment: 0 };
  const fn = direction === 'UP' ? Math.ceil : direction === 'DOWN' ? Math.floor : Math.round;
  const paid = fn(amount / step) * step;
  return { paid, adjustment: Math.round((paid - amount) * 100) / 100 };
};

/** Hourly overtime rate for a given monthly pay and multiplier. */
export const overtimeHourly = (monthlyPay: number, standardHours: number, multiplier: number) =>
  standardHours > 0 ? (monthlyPay / standardHours) * multiplier : 0;

export interface SettingsErrors {
  [field: string]: string;
}

/** Validates a company profile; `codes` are other companies' codes for the uniqueness check. */
export const validateOrg = (name: string, code: string, location: string, s: OrgSettings, codes: string[]): SettingsErrors => {
  const e: SettingsErrors = {};
  if (!s.legalName.trim()) e.legalName = 'Legal name is required';
  if (!s.displayName.trim()) e.displayName = 'Display name is required';
  if (!/^[A-Z0-9-]{2,12}$/.test(code)) e.code = '2–12 capital letters, digits or dashes';
  else if (codes.includes(code)) e.code = 'Another company already uses this code';
  if (!location.trim()) e.location = 'Location is required';
  if (s.kraPin && !/^P\d{9}[A-Z]$/.test(s.kraPin)) e.kraPin = 'Company PINs look like P051234567X';
  if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) e.email = 'Enter a valid email';
  if (s.website && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(s.website)) e.website = 'Enter a valid website';
  if (s.payDay < 1 || s.payDay > 31) e.payDay = 'Day 1–31';
  if (s.cutOffDay < 1 || s.cutOffDay > 31) e.cutOffDay = 'Day 1–31';
  if (s.cutOffDay >= s.payDay) e.cutOffDay = 'Cut-off must be before pay day';
  const o = s.overtime;
  if (o.enabled) {
    if (o.weekdayRate < 1) e['overtime.weekdayRate'] = 'At least 1.0×';
    if (o.restDayRate < 1) e['overtime.restDayRate'] = 'At least 1.0×';
    if (o.holidayRate < 1) e['overtime.holidayRate'] = 'At least 1.0×';
    if (o.standardMonthlyHours < 100 || o.standardMonthlyHours > 300) e['overtime.standardMonthlyHours'] = '100–300 hours';
  }
  const p = s.probation;
  if (p.defaultMonths < 0 || p.defaultMonths > 12) e['probation.defaultMonths'] = '0–12 months';
  if (p.maxMonths < p.defaultMonths || p.maxMonths > 12) e['probation.maxMonths'] = `Between the default (${p.defaultMonths}) and 12 months`;
  const r = s.retirement;
  if (r.normalAge < 50 || r.normalAge > 75) e['retirement.normalAge'] = '50–75';
  if (r.earlyAge > r.normalAge) e['retirement.earlyAge'] = 'Cannot be after normal retirement age';
  if (r.pwdAge < r.normalAge) e['retirement.pwdAge'] = 'Usually equal to or later than normal retirement';
  const l = s.leave;
  if (l.annualDays < 0 || l.annualDays > 60) e['leave.annualDays'] = '0–60 days';
  if (l.carryOverMax > l.annualDays) e['leave.carryOverMax'] = 'Cannot exceed the annual entitlement';
  return e;
};

/** Non-blocking advisories (e.g. below statutory minimums). */
export const orgAdvisories = (s: OrgSettings) => {
  const out: { field: string; text: string }[] = [];
  if (s.leave.annualDays < 21) out.push({ field: 'leave.annualDays', text: 'Below the statutory minimum of 21 working days of annual leave' });
  if (s.leave.maternityDays < 90) out.push({ field: 'leave.maternityDays', text: 'Below the statutory 3 months of maternity leave' });
  if (s.leave.paternityDays < 14) out.push({ field: 'leave.paternityDays', text: 'Below the statutory 2 weeks of paternity leave' });
  if (s.overtime.enabled && s.overtime.weekdayRate < 1.5) out.push({ field: 'overtime.weekdayRate', text: 'Weekday overtime is commonly paid at 1.5× or more' });
  if (!s.kraPin) out.push({ field: 'kraPin', text: 'Add the company KRA PIN before filing PAYE returns and issuing P9s' });
  return out;
};
