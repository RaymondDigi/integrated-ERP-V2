import React, { useMemo, useState } from 'react';
import { Printer, Download, Info } from 'lucide-react';
import { ESS_EMPLOYEE, P9_YEARS, P9_DC_FIXED_LIMIT, buildP9, type P9Row } from './essData';
import { printArea } from './EssRecords';

const MONTHS_UPPER = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Employer details shown on the card
const EMPLOYER = { name: 'Corporate HQ Nairobi', pin: 'P051******8K' };

const money = (v: number | undefined) =>
  v === undefined ? '' : v.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type NumKey = Exclude<keyof P9Row, 'month'>;

const COLUMNS: { key: NumKey; letter: string }[] = [
  { key: 'basic', letter: 'A' },
  { key: 'benefitsNonCash', letter: 'B' },
  { key: 'quarters', letter: 'C' },
  { key: 'gross', letter: 'D' },
  { key: 'ahl', letter: 'E' },
  { key: 'shif', letter: 'F' },
  { key: 'prmf', letter: 'G' },
  { key: 'dcE1', letter: 'E1' },
  { key: 'dcE2', letter: 'E2' },
  { key: 'dcE3', letter: 'E3' },
  { key: 'ooi', letter: 'I' },
  { key: 'totalDeductions', letter: 'J' },
  { key: 'chargeable', letter: 'K' },
  { key: 'taxCharged', letter: 'L' },
  { key: 'personalRelief', letter: 'M' },
  { key: 'insuranceRelief', letter: 'N' },
  { key: 'paye', letter: 'O' }
];

export const EssP9: React.FC = () => {
  const [year, setYear] = useState(P9_YEARS[0]);
  const rows = useMemo(() => buildP9(year), [year]);
  const total = (k: NumKey) => rows.reduce((s, r) => s + r[k], 0);
  const isPartial = rows.length > 0 && rows.length < 12;
  const [mainName, ...otherNames] = ESS_EMPLOYEE.fullName.split(' ').reverse();
  const generated = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="ess-stack">
      <div className="ess-toolbar">
        <div className="ess-segmented" role="tablist" aria-label="Tax year">
          {P9_YEARS.map((y) => (
            <button key={y} role="tab" aria-selected={y === year} className={y === year ? 'active' : ''} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        <div className="ess-inline-actions">
          <button className="btn btn-secondary btn-sm" onClick={printArea} disabled={rows.length === 0} title="Choose 'Save as PDF' as the printer">
            <Download size={14} /> Save as PDF
          </button>
          <button className="btn btn-primary btn-sm" onClick={printArea} disabled={rows.length === 0}>
            <Printer size={14} /> Print P9
          </button>
        </div>
      </div>

      {isPartial && (
        <div className="p9-notice">
          <Info size={14} /> {year} is in progress — the card shows months paid so far. The final card is issued after the December payroll.
        </div>
      )}

      <div className="p9-scroll">
        <article className="p9-paper ess-print-area" aria-label={`P9A tax deduction card ${year}`}>
          {/* Title block */}
          <header className="p9-title">
            <div className="p9-title-center">
              <div className="p9-authority">KENYA REVENUE AUTHORITY</div>
              <div className="p9-dept">DOMESTIC TAXES DEPARTMENT</div>
              <div className="p9-card">
                TAX DEDUCTION CARD YEAR <span className="p9-fill">{year}</span>
              </div>
            </div>
            <div className="p9-form-no">P9A</div>
          </header>

          {/* Employer / employee particulars */}
          <div className="p9-particulars">
            <div className="p9-field wide">
              <span>Employer's Name</span>
              <b>{EMPLOYER.name}</b>
            </div>
            <div className="p9-field">
              <span>Employer's PIN</span>
              <b>{EMPLOYER.pin}</b>
            </div>
            <div className="p9-field">
              <span>Employee's Main Name</span>
              <b>{mainName}</b>
            </div>
            <div className="p9-field">
              <span>Employee's Other Names</span>
              <b>{otherNames.reverse().join(' ')}</b>
            </div>
            <div className="p9-field">
              <span>Employee's PIN</span>
              <b>{ESS_EMPLOYEE.kraPinMasked}</b>
            </div>
          </div>

          {/* The card */}
          <table className="p9-table">
            <thead>
              <tr>
                <th rowSpan={2} className="p9-month-h">MONTH</th>
                <th>Basic Salary</th>
                <th>Benefits – Non Cash</th>
                <th>Value of Quarters</th>
                <th>Total Gross Pay</th>
                <th>Affordable Housing Levy (AHL)</th>
                <th>Social Health Insurance Fund (SHIF)</th>
                <th>Post Retirement Medical Fund (PRMF)</th>
                <th colSpan={3}>Defined Contribution Retirement Scheme</th>
                <th>Owner Occupied Interest</th>
                <th>Total Deductions (Lower of E + F + G + H + I)</th>
                <th>Chargeable Pay (D − J)</th>
                <th>Tax Charged</th>
                <th>Personal Relief</th>
                <th>Insurance Relief</th>
                <th>PAYE Tax (L − M − N)</th>
              </tr>
              <tr className="p9-sub">
                <th />
                <th />
                <th />
                <th />
                <th />
                <th />
                <th />
                <th>30% of A</th>
                <th>Actual</th>
                <th>Fixed</th>
                <th>Amount of Interest</th>
                <th />
                <th />
                <th />
                <th>Total</th>
                <th />
                <th />
              </tr>
              <tr className="p9-letters">
                <th />
                {COLUMNS.map((c) => (
                  <th key={c.key}>{c.letter}</th>
                ))}
              </tr>
              <tr className="p9-ksh">
                <th />
                {COLUMNS.map((c) => (
                  <th key={c.key}>Kshs.</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS_UPPER.map((m, i) => {
                const r = rows[i];
                return (
                  <tr key={m} className={r ? '' : 'p9-empty'}>
                    <td className="p9-month">{m}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={c.key === 'paye' || c.key === 'chargeable' ? 'p9-key' : ''}>
                        {r ? money(r[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="p9-month">TOTALS</td>
                {COLUMNS.map((c) => (
                  <td key={c.key}>{rows.length ? money(total(c.key)) : ''}</td>
                ))}
              </tr>
            </tfoot>
          </table>

          {/* Summary */}
          <div className="p9-totals">
            <div>
              TOTAL CHARGEABLE PAY (COL. K) Kshs. <span className="p9-fill">{money(total('chargeable'))}</span>
            </div>
            <div>
              TOTAL TAX (COL. O) Kshs. <span className="p9-fill">{money(total('paye'))}</span>
            </div>
          </div>

          <div className="p9-important">
            <strong>IMPORTANT</strong>
            <ol>
              <li>Use P9A for all liable employees and where a director or employee received benefits in addition to cash emoluments.</li>
              <li>
                Deductible defined contribution (column H) is the lower of 30% of basic salary (E1), the actual contribution (E2) and the fixed limit of
                Kshs. {P9_DC_FIXED_LIMIT.toLocaleString()} per month (E3).
              </li>
              <li>AHL, SHIF and PRMF contributions are allowable deductions in arriving at chargeable pay.</li>
              <li>Attach this card when filing your annual income tax return.</li>
            </ol>
          </div>

          <footer className="p9-footer">
            <span>Staff ID {ESS_EMPLOYEE.staffId} · {ESS_EMPLOYEE.department}</span>
            <span>
              Generated from payroll records on {generated}
              {isPartial ? ' · Year to date' : ''}
            </span>
          </footer>
        </article>
      </div>
    </div>
  );
};
