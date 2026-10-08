import type { GradeRule, SalaryStructure } from './hcmConfig';
import { GRADE_BANDS } from './hireConfig';

/**
 * Company salary structures (grade bands, notches and standard allowances) maintained in Payroll › Salary
 * structure. Payroll reads them outside React, like the pay item catalogue; with no structure saved the
 * standard rules apply (house 15% of basic, transport KES 8,000 from KES 100,000 basic, else KES 4,000).
 */
let registry: SalaryStructure[] = [];
export const setSalaryStructures = (list: SalaryStructure[]) => {
  registry = list;
};

const gradeForBasic = (basic: number) => (GRADE_BANDS.find((b) => basic <= b.max) ?? GRADE_BANDS[GRADE_BANDS.length - 1]).grade;

/** The grade rule in force for a company and pay month ('YYYY-MM'), if the company has saved a structure. */
export const gradeRuleAt = (orgId: string, grade: string | undefined, basic: number, key: string): GradeRule | undefined => {
  const s = registry
    .filter((x) => x.orgId === orgId && x.effectiveFrom <= key)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0];
  if (!s) return undefined;
  const g = (grade ?? gradeForBasic(basic)).slice(0, 5);
  return s.rules.find((r) => r.grade.slice(0, 5) === g);
};
