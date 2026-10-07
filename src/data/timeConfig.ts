import type { HREmployee } from '../types';

/* ------------------------------------------------------------------ */
/* Work schedules                                                      */
/* ------------------------------------------------------------------ */

export type ScheduleId = 'OFFICE' | 'DAY' | 'NIGHT' | 'ESTATE' | 'FIELD' | 'PART';
export type PunchSource = 'BIOMETRIC' | 'MOBILE' | 'MANUAL';

export interface WorkSchedule {
  id: ScheduleId;
  name: string;
  /** Minutes after midnight */
  start: number;
  /** Minutes after midnight of the start day (over 1440 when the shift ends the next morning) */
  end: number;
  breakMin: number;
  graceMin: number;
  /** Working days, 0 = Sunday */
  days: number[];
  hoursPerDay: number;
  punch: 'BIOMETRIC' | 'MOBILE';
  appliesTo: string;
}

const MON_FRI = [1, 2, 3, 4, 5];

export const SCHEDULES: Record<ScheduleId, WorkSchedule> = {
  OFFICE: { id: 'OFFICE', name: 'Office hours', start: 8 * 60, end: 17 * 60, breakMin: 60, graceMin: 10, days: MON_FRI, hoursPerDay: 9, punch: 'BIOMETRIC', appliesTo: 'Finance, sales, ICT, HR, management' },
  DAY: { id: 'DAY', name: 'Factory day shift', start: 6 * 60, end: 15 * 60, breakMin: 45, graceMin: 5, days: MON_FRI, hoursPerDay: 9, punch: 'BIOMETRIC', appliesTo: 'Engineering, quality, packing, Block C casuals' },
  NIGHT: { id: 'NIGHT', name: 'Factory night shift', start: 21 * 60, end: 30 * 60, breakMin: 45, graceMin: 5, days: MON_FRI, hoursPerDay: 9, punch: 'BIOMETRIC', appliesTo: 'Production lines on the night week of the rota' },
  ESTATE: { id: 'ESTATE', name: 'Estate field day', start: 6 * 60 + 30, end: 15 * 60 + 30, breakMin: 30, graceMin: 10, days: MON_FRI, hoursPerDay: 9, punch: 'MOBILE', appliesTo: 'Field operatives (GPS punch at the block)' },
  FIELD: { id: 'FIELD', name: 'Transport and field', start: 7 * 60, end: 16 * 60, breakMin: 60, graceMin: 10, days: MON_FRI, hoursPerDay: 9, punch: 'MOBILE', appliesTo: 'Drivers and staff working away from site' },
  PART: { id: 'PART', name: 'Part-time (Mon, Wed, Fri)', start: 8 * 60, end: 17 * 60, breakMin: 60, graceMin: 10, days: [1, 3, 5], hoursPerDay: 9, punch: 'BIOMETRIC', appliesTo: 'Part-time staff' }
};

export const TIME_RULES = {
  hoursPerDay: 9,
  hoursPerWeek: 45,
  /** Weekday overtime is counted from this many minutes past the shift end */
  otThresholdMin: 30,
  otRoundMin: 30,
  weekdayRate: 1.5,
  saturdayRate: 1.5,
  sundayHolidayRate: 2,
  /** Days of history the terminals hold in this demo */
  historyDays: 128,
  /** Supervisors work exceptions from this many days back; older ones were closed with payroll */
  queueDays: 42
};

/** Companies whose terminals are connected (others have no punch data yet). */
export const TRACKED_ORGS = ['org-kericho'];

export const isCasual = (e: HREmployee) => /daily-rated|output-based/i.test(e.contractType);

/** Production lines rotate day and night weekly. */
const ROTATING_TITLES = ['Production Operative', 'Machine Operator'];

export type ScheduleRule = 'ROTATING' | ScheduleId;

export const scheduleRuleFor = (e: HREmployee): ScheduleRule => {
  if (/driver/i.test(e.jobTitle)) return 'FIELD';
  // By role, so a casual converted to monthly terms keeps the same roster
  if (/field operative|field worker|farm hand/i.test(e.jobTitle)) return 'ESTATE';
  if (isCasual(e)) return /production/i.test(e.jobTitle) ? 'DAY' : 'ESTATE';
  if (/part-time/i.test(e.jobTitle)) return 'PART';
  if (e.department === 'Production & Quality Control' && ROTATING_TITLES.includes(e.jobTitle)) return 'ROTATING';
  if (e.department === 'Production & Quality Control' || e.department === 'Engineering & Maintenance' || /packer|storekeeper/i.test(e.jobTitle)) return 'DAY';
  return 'OFFICE';
};

export const RULE_LABEL: Record<ScheduleRule, string> = {
  ROTATING: 'Rotating day / night (weekly)',
  OFFICE: SCHEDULES.OFFICE.name,
  DAY: SCHEDULES.DAY.name,
  NIGHT: SCHEDULES.NIGHT.name,
  ESTATE: SCHEDULES.ESTATE.name,
  FIELD: SCHEDULES.FIELD.name,
  PART: SCHEDULES.PART.name
};

/** Terminal used for each schedule. */
export const DEVICE: Record<ScheduleId, { device: string; site: string }> = {
  OFFICE: { device: 'ZK-HQ-01 · Admin block reader', site: 'Head office, Block A' },
  DAY: { device: 'HIK-FAC-02 · Factory turnstile', site: 'Factory, Block C' },
  NIGHT: { device: 'HIK-FAC-02 · Factory turnstile', site: 'Factory, Block C' },
  PART: { device: 'ZK-HQ-01 · Admin block reader', site: 'Head office, Block A' },
  ESTATE: { device: 'Mobile app · GPS geofence', site: 'Estate blocks D–F' },
  FIELD: { device: 'Mobile app · GPS geofence', site: 'Transport yard and routes' }
};

/* ------------------------------------------------------------------ */
/* Seed behaviour                                                      */
/* ------------------------------------------------------------------ */

export type Profile = 'LATE' | 'ABSENT' | 'STEADY';

/** A few people with patterns that the disciplinary seed cases refer to. */
export const PROFILES: Record<string, Profile> = {
  'KHE-1101': 'LATE',
  'KHE-1107': 'ABSENT',
  'KHE-0120': 'STEADY',
  'KHE-0419': 'STEADY'
};

/** Share of weekdays each casual is called in (they work when engaged). */
export const CASUAL_INTENSITY: Record<string, number> = {
  'CAS-1402': 0.97,
  'CAS-1405': 0.86,
  'CAS-1115': 0.72,
  'CAS-1116': 0.45,
  'CAS-1117': 0.9,
  'CAS-1118': 0.6,
  'CAS-1119': 0.38,
  'CAS-1120': 0.8
};

export const SUPERVISOR = 'Esther Muthoni';
export const HR_OFFICER = 'Rose Chepkoech';
