import type { HREmployee } from '../types';
import type { PayItem } from '../data/payItems';
import type { PayReduction } from '../data/payrollEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };

/** What the People & Payroll extension slices (events, welfare, travel, registers) can use from the app. */
export interface PeopleDeps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  /** Payroll period being prepared; items can only be posted to it or later */
  payrollOpenPeriod: { year: number; month: number; key: string; label: string };
  /** Posts one-off or recurring earnings/deductions to payroll (component ids from payComponents.ts) */
  postPayItems: (items: Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>[], by?: string) => number;
  /** Withholds a share of daily pay over a date range (e.g. suspension without pay) */
  addPayReduction: (r: Omit<PayReduction, 'id'>) => PayReduction;
  removePayReduction: (id: string) => void;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  /** Audit trail entries for an employee (Employee Master → Changes & audit) */
  logEmployeeEdit: (staffId: string, rows: { action: string; sensitive?: boolean }[], by?: string) => void;
  addToast: (t: Toast) => void;
}
