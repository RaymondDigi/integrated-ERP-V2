import React from 'react';
import type { HREmployee } from '../../../types';
import { payableIn, payslip, type PayrollContext, type Payslip } from '../../../data/payrollEngine';
import { amountInWords, kes, payRail } from './reports';

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Year-to-date totals for the P9: every month this year up to and including this payslip. */
const ytd = (e: HREmployee, p: Payslip, ctx: PayrollContext) => {
  const slips = Array.from({ length: p.month + 1 }, (_, m) => m).filter((m) => payableIn([e], e.orgId, p.year, m).length).map((m) => payslip(e, p.year, m, ctx));
  const s = (k: (x: Payslip) => number) => slips.reduce((t, x) => t + k(x), 0);
  return { gross: s((x) => x.gross), paye: s((x) => x.paye), nssf: s((x) => x.nssf), shif: s((x) => x.shif), ahl: s((x) => x.ahl), net: s((x) => x.net) };
};

/**
 * Payslip in the order the payroll spec lays out (§16): gross pay → statutory deductions → taxable pay →
 * PAYE working with every relief line → voluntary deductions → net pay, then employer contributions and YTD.
 */
export const PayslipDocument: React.FC<{ e: HREmployee; p: Payslip; ctx: PayrollContext; company: string }> = ({ e, p, ctx, company }) => {
  const t = p.tax;
  const y = ytd(e, p, ctx);
  const statutoryTotal = p.nssf + p.shif + p.ahl + p.paye;
  const voluntary = p.deductions.filter((d) => d.requested > 0);
  const [yy, mm, dd] = p.payDate.split('-');
  return (
    <div className="pr-paper">
      <div className="pr-paper-head">
        <div>
          <h2>{company.toUpperCase()}</h2>
          <p>
            {p.exit ? 'FINAL PAYSLIP' : 'PAYSLIP'} FOR {p.period.toUpperCase()}
            {p.exit ? ` (${p.exit.type.toUpperCase()})` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div>
            Pay date <strong>{`${dd}/${mm}/${yy}`}</strong>
          </div>
          <div className="pr-muted">Rates: {t.rateTable.id} · {t.rateTable.label}</div>
        </div>
      </div>

      <div className="pr-paper-meta">
        <div>
          <span>Employee name</span> <strong>{e.fullName}</strong>
        </div>
        <div>
          <span>Staff no.</span> {e.staffId}
        </div>
        <div>
          <span>Job title</span> {e.jobTitle}
        </div>
        <div>
          <span>Department</span> {e.department}
        </div>
        <div>
          <span>KRA PIN</span> {e.kraPinMasked}
        </div>
        <div>
          <span>NSSF / SHIF no.</span> {e.nssfNoMasked} · {e.shifNoMasked}
        </div>
        <div>
          <span>Days worked</span> {p.casual ? `${p.daysWorked} days (daily-rated)` : `${p.daysPaid} / ${p.daysInPeriod}`}
        </div>
        <div>
          <span>Paid to</span> {payRail(e) === 'M-Pesa' ? `M-Pesa ${e.mpesaPhoneMasked}` : e.bankAccountMasked}
        </div>
        {p.exit && (
          <div>
            <span>Last working day</span> {p.exit.date}
          </div>
        )}
        {e.tax?.pwdExempt && (
          <div>
            <span>PWD certificate</span> {e.tax.pwdCertificateNo} (valid to {e.tax.pwdCertificateExpiry})
          </div>
        )}
        {e.tax?.employment === 'SECONDARY' && (
          <div>
            <span>Employment</span> Secondary — no reliefs at this employer
          </div>
        )}
      </div>

      <table className="pr-doc">
        <tbody>
          <tr>
            <th>Earnings</th>
            <th className="num">KES</th>
          </tr>
          {p.earnings.map((l, i) => (
            <tr key={i}>
              <td>
                {l.label}
                {l.ref && <span className="ref">{l.ref}</span>}
                {l.flags.paye === 'exempt' && <span className="ref">Not taxable — {l.note}</span>}
                {l.flags.paye !== 'exempt' && !l.flags.nssf && !['OVERTIME'].includes(l.componentId) && <span className="ref">Not NSSF-pensionable</span>}
              </td>
              <td className="num">{money(l.amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Gross pay</td>
            <td className="num">{money(p.gross)}</td>
          </tr>

          {p.benefits.length > 0 && (
            <>
              <tr>
                <th>Non-cash benefits (for tax only — not paid)</th>
                <th className="num">KES</th>
              </tr>
              {p.benefits.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.label}
                    {l.ref && <span className="ref">{l.ref}</span>}
                  </td>
                  <td className="num">{money(l.amount)}</td>
                </tr>
              ))}
            </>
          )}

          <tr>
            <th>Statutory deductions</th>
            <th className="num">KES</th>
          </tr>
          <tr>
            <td>
              NSSF (Tier I {kes(t.nssfTierI)} + Tier II {kes(t.nssfTierII)})
              <span className="ref">6% of pensionable pay KES {kes(t.nssfBase)}, limits {kes(t.rateTable.nssf.lel)} / {kes(t.rateTable.nssf.uel)}</span>
            </td>
            <td className="num">{money(p.nssf)}</td>
          </tr>
          <tr>
            <td>
              SHIF<span className="ref">2.75% of KES {kes(p.shifBase)}, minimum KES {t.rateTable.shif.floor}</span>
            </td>
            <td className="num">{money(p.shif)}</td>
          </tr>
          <tr>
            <td>
              Affordable Housing Levy<span className="ref">1.5% of KES {kes(p.ahlBase)}</span>
            </td>
            <td className="num">{money(p.ahl)}</td>
          </tr>
          {t.pensionAllowed > 0 && (
            <tr>
              <td className="indent">Less allowable pension contribution</td>
              <td className="num">({money(t.pensionAllowed)})</td>
            </tr>
          )}
          {t.mortgageAllowed > 0 && (
            <tr>
              <td className="indent">Less owner-occupied mortgage interest</td>
              <td className="num">({money(t.mortgageAllowed)})</td>
            </tr>
          )}
          {p.exemptCash > 0 && (
            <tr>
              <td className="indent">Less non-taxable cash (per diem, reimbursements, severance)</td>
              <td className="num">({money(p.exemptCash)})</td>
            </tr>
          )}
          <tr className="total">
            <td>Taxable pay</td>
            <td className="num">{money(t.taxablePay)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="pr-muted" style={{ paddingTop: 8 }}>
              PAYE computation
            </td>
          </tr>
          {t.pwdExempt > 0 && (
            <tr>
              <td className="indent">Less PWD exemption (first KES {kes(t.rateTable.paye.pwdExemptMonthly)} of taxable pay)</td>
              <td className="num">({money(t.pwdExempt)})</td>
            </tr>
          )}
          {t.bandLines.map((b) => (
            <tr key={b.band}>
              <td className="indent">
                {t.method === 'HIGHEST_RATE' ? 'Secondary employment flat rate' : `Band ${b.band}`}: {money(b.amount)} × {+(b.rate * 100).toFixed(1)}%
              </td>
              <td className="num">{money(b.tax)}</td>
            </tr>
          ))}
          <tr>
            <td className="indent">Gross tax</td>
            <td className="num">{money(t.grossTax)}</td>
          </tr>
          {t.method === 'BANDS' && (
            <>
              <tr>
                <td className="indent">Less personal relief</td>
                <td className="num">({money(t.personalRelief)})</td>
              </tr>
              {t.housingRelief > 0 && (
                <tr>
                  <td className="indent">Less housing relief</td>
                  <td className="num">({money(t.housingRelief)})</td>
                </tr>
              )}
              <tr>
                <td className="indent">Less PMF relief (15% of PMF contribution)</td>
                <td className="num">({money(t.pmfRelief)})</td>
              </tr>
              <tr>
                <td className="indent">Less insurance relief (15% of premiums)</td>
                <td className="num">({money(t.insuranceRelief)})</td>
              </tr>
            </>
          )}
          <tr>
            <td>
              PAYE payable<span className="ref">{t.note}</span>
            </td>
            <td className="num">{money(p.paye)}</td>
          </tr>
          <tr className="total">
            <td>Total statutory deductions</td>
            <td className="num">{money(statutoryTotal)}</td>
          </tr>

          {p.pretax.some((l) => l.flags.cash) && (
            <>
              <tr>
                <th>Pension and medical fund</th>
                <th className="num">KES</th>
              </tr>
              {p.pretax
                .filter((l) => l.flags.cash)
                .map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.label}
                      {l.ref && <span className="ref">{l.ref}</span>}
                    </td>
                    <td className="num">{money(l.amount)}</td>
                  </tr>
                ))}
            </>
          )}

          <tr className="total">
            <td>
              Net pay before voluntary deductions
              {!p.exit && <span className="ref">Two-thirds limit: up to KES {kes(p.deductionCap)} may be deducted below</span>}
              {p.exit && <span className="ref">Final settlement — loans recovered in full, outside the two-thirds limit</span>}
            </td>
            <td className="num">{money(p.netAfterStatutory)}</td>
          </tr>

          {voluntary.length > 0 && (
            <>
              <tr>
                <th>Other / voluntary deductions</th>
                <th className="num">KES</th>
              </tr>
              {voluntary.map((d, i) => (
                <tr key={i} className={d.deferred ? 'deferred' : ''}>
                  <td>
                    {d.label}
                    {d.ref && d.ref !== 'Standing deduction' && <span className="ref">{d.ref}</span>}
                    {d.balanceAfter !== undefined && <span className="ref">Balance after this payslip: KES {kes(d.balanceAfter)}</span>}
                    {d.note && <span className="ref">{d.note}</span>}
                    {d.deferred > 0 && <span className="ref">KES {kes(d.deferred)} deferred to next month</span>}
                  </td>
                  <td className="num">{money(d.deducted)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total other deductions</td>
                <td className="num">{money(voluntary.reduce((s, d) => s + d.deducted, 0))}</td>
              </tr>
            </>
          )}

          <tr className="grand">
            <td>NET PAY</td>
            <td className="num">{money(p.net)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 12, margin: '8px 0 14px' }}>
        <span className="pr-muted">Net pay in words:</span> <strong>{amountInWords(p.net)}</strong>
      </div>

      <div className="pr-two-col">
        <table className="pr-doc">
          <tbody>
            <tr>
              <th>Employer contributions (information only)</th>
              <th className="num">KES</th>
            </tr>
            <tr>
              <td>NSSF employer match</td>
              <td className="num">{money(p.employerNssf)}</td>
            </tr>
            <tr>
              <td>Housing levy employer match</td>
              <td className="num">{money(p.employerAhl)}</td>
            </tr>
            <tr>
              <td>NITA levy</td>
              <td className="num">{money(p.nita)}</td>
            </tr>
            <tr className="total">
              <td>Cost to company</td>
              <td className="num">{money(p.costToCompany)}</td>
            </tr>
          </tbody>
        </table>
        <table className="pr-doc">
          <tbody>
            <tr>
              <th>Year to date ({p.year})</th>
              <th className="num">KES</th>
            </tr>
            <tr>
              <td>Gross pay</td>
              <td className="num">{money(y.gross)}</td>
            </tr>
            <tr>
              <td>PAYE</td>
              <td className="num">{money(y.paye)}</td>
            </tr>
            <tr>
              <td>NSSF (employee)</td>
              <td className="num">{money(y.nssf)}</td>
            </tr>
            <tr>
              <td>SHIF</td>
              <td className="num">{money(y.shif)}</td>
            </tr>
            <tr>
              <td>Housing levy</td>
              <td className="num">{money(y.ahl)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {p.warnings.length > 0 && (
        <div className="pr-note warn pr-no-print" style={{ marginTop: 12 }}>
          {p.warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}
      <div className="pr-paper-foot">This is a computer-generated payslip and does not require a signature.</div>
    </div>
  );
};
