import React from 'react';
import { Download, Printer } from 'lucide-react';
import { printArea } from '../../ess/EssRecords';
import { downloadCsv, kes } from './reports';

export type Cell = string | number;

export interface Section {
  heading?: string;
  note?: string;
  columns: { label: string; num?: boolean }[];
  rows: Cell[][];
  foot?: Cell[];
}

export interface Report {
  title: string;
  subtitle: string;
  kpis?: { label: string; value: string; sub?: string }[];
  sections: Section[];
  footnote?: string;
}

const fmt = (c: Cell, num?: boolean) => (num && typeof c === 'number' ? kes(c) : c);

/** A printable report on paper, with print and CSV export. */
export const ReportPaper: React.FC<{ report: Report; company: string; preparedBy?: string }> = ({ report, company, preparedBy = 'Rose Chepkoech, HR & Payroll Officer' }) => {
  const csv = () =>
    downloadCsv(
      `${report.title} ${report.subtitle}`,
      [report.title, report.subtitle],
      report.sections.flatMap((s) => [[], [s.heading ?? ''], s.columns.map((c) => c.label), ...s.rows, ...(s.foot ? [s.foot] : [])])
    );
  return (
    <>
      <div className="pr-toolbar pr-no-print" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn btn-secondary" onClick={csv}>
          <Download size={15} /> Export CSV
        </button>
        <button className="btn btn-primary" onClick={printArea}>
          <Printer size={15} /> Print
        </button>
      </div>
      <div className="pr-paper ess-print-area pr-print-stack">
        <div className="pr-paper-head">
          <div>
            <h2>{company.toUpperCase()}</h2>
            <p>
              <strong>{report.title}</strong> — {report.subtitle}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11.5 }} className="pr-muted">
            Printed {new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
            <br />
            Prepared by {preparedBy}
          </div>
        </div>
        {report.kpis && (
          <div className="pr-kv" style={{ marginBottom: 14 }}>
            {report.kpis.map((k) => (
              <div key={k.label}>
                <span>{k.label}</span>
                <strong>{k.value}</strong>
                {k.sub && <small>{k.sub}</small>}
              </div>
            ))}
          </div>
        )}
        {report.sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 16, overflowX: 'auto' }}>
            <table className="pr-doc">
              <thead>
                {s.heading && (
                  <tr>
                    <th colSpan={s.columns.length} style={{ fontSize: 11.5, color: 'var(--text-primary)', borderBottom: 'none' }}>
                      {s.heading}
                    </th>
                  </tr>
                )}
                <tr>
                  {s.columns.map((c, k) => (
                    <th key={k} className={c.num ? 'num' : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, j) => (
                      <td key={j} className={s.columns[j]?.num ? 'num' : undefined}>
                        {fmt(c, s.columns[j]?.num)}
                      </td>
                    ))}
                  </tr>
                ))}
                {s.rows.length === 0 && (
                  <tr>
                    <td colSpan={s.columns.length} className="pr-muted">
                      Nothing to show.
                    </td>
                  </tr>
                )}
                {s.foot && (
                  <tr className="total">
                    {s.foot.map((c, j) => (
                      <td key={j} className={s.columns[j]?.num ? 'num' : undefined}>
                        {fmt(c, s.columns[j]?.num)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
            {s.note && <div className="pr-paper-foot">{s.note}</div>}
          </div>
        ))}
        {report.footnote && <div className="pr-paper-foot">{report.footnote}</div>}
      </div>
    </>
  );
};
