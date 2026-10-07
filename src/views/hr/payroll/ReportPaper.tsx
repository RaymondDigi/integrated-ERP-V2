import React from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { printArea } from '../../ess/EssRecords';
import { downloadCsv, downloadExcel, kes } from './reports';

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
  /** Sign-off lines printed at the end (e.g. Prepared by, Checked by, Approved by) */
  signatures?: string[];
  /** Wide reports print on landscape paper */
  landscape?: boolean;
  /** Rows styled as subtotals (by section index → row indexes) */
  subtotalRows?: Record<number, number[]>;
  /** Rows that are group headings spanning the table (by section index → row indexes) */
  headingRows?: Record<number, number[]>;
  /** Show zero amounts as blanks (dense registers) */
  blankZero?: boolean;
}

const fmt = (c: Cell, num?: boolean, blankZero?: boolean) => (num && typeof c === 'number' ? (blankZero && c === 0 ? '' : kes(c)) : c);

/** A printable report on paper, with print and CSV export. */
export const ReportPaper: React.FC<{ report: Report; company: string; preparedBy?: string }> = ({ report, company, preparedBy = 'Rose Chepkoech, HR & Payroll Officer' }) => {
  const csv = () =>
    downloadCsv(
      `${report.title} ${report.subtitle}`,
      [report.title, report.subtitle],
      report.sections.flatMap((s) => [[], [s.heading ?? ''], s.columns.map((c) => c.label), ...s.rows, ...(s.foot ? [s.foot] : [])])
    );
  const excel = () =>
    downloadExcel(
      `${report.title} ${report.subtitle}`,
      report.sections.map((s, i) => ({
        name: s.heading ?? (report.sections.length > 1 ? `Part ${i + 1}` : report.title),
        title: `${company} — ${report.title}, ${report.subtitle}${s.heading ? ` — ${s.heading}` : ''}`,
        header: s.columns.map((c) => c.label),
        rows: s.rows,
        foot: s.foot
      }))
    );
  return (
    <>
      <div className="pr-toolbar pr-no-print" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn btn-secondary" onClick={excel}>
          <FileSpreadsheet size={15} /> Export to Excel
        </button>
        <button className="btn btn-secondary" onClick={csv}>
          <Download size={15} /> CSV
        </button>
        <button className="btn btn-primary" onClick={printArea}>
          <Printer size={15} /> Print
        </button>
      </div>
      <div className={`pr-paper ess-print-area pr-print-stack ${report.landscape ? 'pr-wide' : ''}`}>
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
                {s.rows.map((r, k) =>
                  report.headingRows?.[i]?.includes(k) ? (
                    <tr key={k} className="pr-group-row">
                      <td colSpan={s.columns.length}>{r[0]}</td>
                    </tr>
                  ) : (
                    <tr key={k} className={report.subtotalRows?.[i]?.includes(k) ? 'total' : undefined}>
                      {r.map((c, j) => (
                        <td key={j} className={s.columns[j]?.num ? 'num' : undefined}>
                          {fmt(c, s.columns[j]?.num, report.blankZero)}
                        </td>
                      ))}
                    </tr>
                  )
                )}
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
        {report.signatures && (
          <div className="pr-signatures">
            {report.signatures.map((who) => (
              <div key={who}>
                <span className="pr-sign-line" />
                <strong>{who}</strong>
                <span>Name ____________________</span>
                <span>Signature __________  Date ________</span>
              </div>
            ))}
          </div>
        )}
        {report.landscape && <style>{'@media print { @page { size: A4 landscape; margin: 8mm; } }'}</style>}
      </div>
    </>
  );
};
