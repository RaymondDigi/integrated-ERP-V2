/* Things the portal remembers on this device for the session: anonymous report codes and trip snapshots. */
import type { Imprest, TravelRequest } from '../../data/travelEngine';

export interface MyReport {
  caseId: string;
  ref: string;
  anonymous: boolean;
  /** Private follow-up code shown to an anonymous reporter */
  code?: string;
}

const KEY = 'ess-my-reports';

const load = (): MyReport[] => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MyReport[]) : [];
  } catch {
    return [];
  }
};

const reports: MyReport[] = load();

export const myReports = () => reports;

export const rememberReport = (r: MyReport) => {
  reports.unshift(r);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(reports));
  } catch {
    /* storage unavailable: kept in memory only */
  }
};

/** Short private code, e.g. 7KQ4-M2XD (no look-alike characters) */
export const newCaseCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => abc[Math.floor(Math.random() * abc.length)];
  return `${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`;
};

/* Trips submitted here, so they stay listed even while HR has another company selected. */
const trips = new Map<string, TravelRequest>();
export const rememberTrip = (t: TravelRequest) => trips.set(t.id, t);
export const rememberedTrips = () => [...trips.values()];

/* Advances requested here, for the same reason. */
const advances = new Map<string, Imprest>();
export const rememberAdvance = (i: Imprest) => advances.set(i.id, i);
export const rememberedAdvances = () => [...advances.values()];
