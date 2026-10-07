import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { buildMatrix, budgetLines, CERT_STATUS, type CertStatus } from '../../../data/trainingEngine';
import { Pill } from '../time/shared';

export { Chips, EmpCell, Empty, Pill } from '../time/shared';

/** Staff, skills matrix and budget for the selected company. */
export const useTrainingOrg = () => {
  const { hrEmployees, selectedOrgId, certRecords, trainingToday, trainingSessions, trainingNeeds, trainingBudgets } = useApp();
  return useMemo(() => {
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId);
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const matrix = buildMatrix(staff, certRecords, trainingToday);
    const sessions = trainingSessions.filter((s) => s.orgId === selectedOrgId);
    const needs = trainingNeeds.filter((n) => n.orgId === selectedOrgId);
    const year = Number(trainingToday.slice(0, 4));
    const orgDepts = new Set(staff.map((e) => e.department));
    const budgets = Object.fromEntries(Object.entries(trainingBudgets).filter(([d]) => orgDepts.has(d)));
    const budget = budgetLines(budgets, sessions, needs, byId, year);
    return { staff, byId, matrix, sessions, needs, year, budget, today: trainingToday };
  }, [hrEmployees, selectedOrgId, certRecords, trainingToday, trainingSessions, trainingNeeds, trainingBudgets]);
};

export const CertPill: React.FC<{ status: CertStatus; days?: number }> = ({ status, days }) => (
  <Pill cls={CERT_STATUS[status].cls} title={days !== undefined ? `${days} days left` : undefined}>
    {status === 'EXPIRED' && days !== undefined ? `Expired ${-days}d ago` : status.startsWith('DUE') && days !== undefined ? `${days} days left` : CERT_STATUS[status].label}
  </Pill>
);

export const PRIORITY_CLS = { High: 'critical', Medium: 'warning', Low: 'primary' } as const;

export const downloadCsv = (name: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** Budget used bar: spent (solid) + committed (light) against the budget */
export const BudgetBar: React.FC<{ budget: number; spent: number; committed: number }> = ({ budget, spent, committed }) => {
  const total = Math.max(budget, spent + committed, 1);
  const over = spent + committed > budget;
  return (
    <div className={`tr-bar${over ? ' over' : ''}`} role="img" aria-label={`Spent ${spent}, committed ${committed} of ${budget}`}>
      <span className="spent" style={{ width: `${(spent / total) * 100}%` }} />
      <span className="committed" style={{ width: `${(committed / total) * 100}%` }} />
    </div>
  );
};
