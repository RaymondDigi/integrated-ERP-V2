import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Panel, DataTable, Field, Stat } from '../../../suites/ui/kit';
import { BANK_FORMATS, DEFAULT_GL_MAP, type BankFormat, type GradeRule, type PayrollGlMap } from '../../../data/hcmConfig';
import { buildDmeFile, defaultGradeRules, kes, notchesOf, payrollJournalLines, type GlRow } from '../../../data/hcmEngine';
import { downloadText } from '../../../platform/csv';
import { periodOf, payRail, rowsFor } from '../payroll/reports';
import { Btn, SimulatedBadge, StatusPill, Toolbar, useCanEdit } from './ui';
import { Layers, Landmark, FileDown } from 'lucide-react';

/** Payroll › Salary structure: grades, band min/mid/max, notches and standard allowances per grade, versioned by month. */
export const SalaryStructureTab: React.FC = () => {
  const { salaryStructures, saveSalaryStructure, selectedOrgId, payrollOpenPeriod } = useApp();
  const { canEdit, canApprove } = useCanEdit();
  const versions = salaryStructures.filter((s) => s.orgId === selectedOrgId).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const current = versions[0]?.rules ?? defaultGradeRules();
  const [rules, setRules] = useState<GradeRule[]>(current);
  const [from, setFrom] = useState(payrollOpenPeriod.key);
  const set = (i: number, k: keyof GradeRule, v: string) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: k === 'grade' ? v : Number(v) } : r)));
  return (
    <Panel
      title="Salary structure"
      subtitle="Grade bands drive the band check on pay changes; house and transport allowances on every payslip follow the grade from the effective month."
      action={
        <Toolbar>
          <input className="form-control" style={{ width: 120 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Effective from (YYYY-MM)" />
          <Btn primary disabled={!canEdit} title={canApprove ? undefined : 'A manager approves structure changes'} onClick={() => saveSalaryStructure(rules, from)}>
            Save new version
          </Btn>
        </Toolbar>
      }
    >
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th className="num">Minimum</th>
              <th className="num">Midpoint</th>
              <th className="num">Maximum</th>
              <th className="num">Notches</th>
              <th className="num">House %</th>
              <th className="num">Transport</th>
              <th>Notch scale</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.grade}>
                <td>{r.grade}</td>
                {(['min', 'mid', 'max', 'notches', 'housePct', 'transportKes'] as const).map((k) => (
                  <td key={k} className="num">
                    <input className="form-control" style={{ width: k === 'notches' || k === 'housePct' ? 64 : 110 }} type="number" value={r[k]} onChange={(e) => set(i, k, e.target.value)} aria-label={`${r.grade} ${k}`} disabled={!canEdit} />
                  </td>
                ))}
                <td className="muted" style={{ fontSize: 11 }}>
                  {notchesOf(r)
                    .map((n) => n.toLocaleString())
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        Versions:{' '}
        {versions.length
          ? versions.map((v) => `v${v.version} from ${v.effectiveFrom} (${v.changedBy})`).join(' · ')
          : 'standard bands in use (no company version saved yet)'}
      </p>
    </Panel>
  );
};

/** Payroll › GL & bank files: GL accounts and cost-centre mapping, journal preview and bank DME files. */
export const BankFilesTab: React.FC = () => {
  const { glMaps, saveGlMap, selectedOrgId, hrEmployees, payrollOpenPeriod, payrollCtx, recordDme, markDmeUploaded, dmeLogs, activeTenant } = useApp();
  const { canEdit } = useCanEdit();
  const map = glMaps[selectedOrgId] ?? DEFAULT_GL_MAP;
  const [draft, setDraft] = useState<PayrollGlMap>(map);
  const open = periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month);
  const rows = useMemo(() => rowsFor(hrEmployees, [selectedOrgId], open, payrollCtx), [hrEmployees, selectedOrgId, open, payrollCtx]);
  const gl: GlRow[] = rows.map((r) => ({
    department: r.p.department,
    casual: r.p.casual,
    gross: r.p.gross,
    employer: r.p.employerNssf + r.p.employerAhl + r.p.nita,
    paye: r.p.paye,
    statutory: r.p.nssf + r.p.shif + r.p.ahl,
    other: r.p.pretaxCash + r.p.deductions.reduce((x, d) => x + d.deducted, 0),
    net: r.p.net
  }));
  const preview = payrollJournalLines(gl, draft);
  const depts = [...new Set(rows.map((r) => r.p.department))].sort();
  const [format, setFormat] = useState<BankFormat>('KCB_EFT');
  const [debit, setDebit] = useState('1102 345 678 900');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const generate = () => {
    const f = buildDmeFile(format, {
      company: activeTenant.name,
      debitAccount: debit,
      period: open.key,
      valueDate: `${open.key}-25`,
      lines: rows.map((r) => ({ staffId: r.e.staffId, name: r.e.fullName, rail: payRail(r.e) === 'M-Pesa' ? 'M-Pesa' : 'Bank', account: (payRail(r.e) === 'M-Pesa' ? r.e.mpesaPhoneMasked : r.e.bankAccountMasked) ?? '', amount: r.p.net }))
    });
    const log = recordDme({ period: open.key, format, debitAccount: debit, lines: f.lines, totalKes: f.total, hash: f.hash });
    if (log) downloadText(`${f.batch}-${format}.${BANK_FORMATS[format].ext}`, f.text, 'text/plain');
  };
  return (
    <>
      <div className="sx-stats">
        <Stat label="Journal lines" value={preview.length} detail={`${depts.length} departments → ${new Set(depts.map((d) => draft.costCentre[d] ?? 'Administration')).size} cost centres`} icon={<Layers size={16} />} />
        <Stat label="Casual wages included" value={kes(gl.filter((g) => g.casual).reduce((n, g) => n + g.gross, 0))} detail={`${gl.filter((g) => g.casual).length} casual workers`} icon={<Landmark size={16} />} tone="gold" />
        <Stat label="Bank files" value={dmeLogs.filter((l) => l.orgId === selectedOrgId).length} detail="generated this session" icon={<FileDown size={16} />} tone="blue" />
      </div>
      <Panel
        title="GL accounts & cost centres"
        subtitle="Each HR department posts to a Finance cost centre; salaried and casual pay are separate lines."
        action={
          <Btn primary disabled={!canEdit} onClick={() => saveGlMap(draft)}>
            Save mapping
          </Btn>
        }
      >
        <div className="sx-grid">
          {(['salaries', 'casualWages', 'employerCosts', 'paye', 'statutory', 'otherDeductions', 'netPay'] as const).map((k) => (
            <Field key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase())}>
              <input className="form-control" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} disabled={!canEdit} />
            </Field>
          ))}
          {depts.map((d) => (
            <Field key={d} label={`${d} → cost centre`}>
              <select className="form-control" value={draft.costCentre[d] ?? 'Administration'} onChange={(e) => setDraft({ ...draft, costCentre: { ...draft.costCentre, [d]: e.target.value } })} disabled={!canEdit}>
                {['Finance', 'Operations', 'Sales', 'Administration', 'ICT'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <h4 style={{ margin: '14px 0 6px' }}>Journal preview — {open.label}</h4>
        <DataTable
          rows={preview}
          rowKey={(l) => l.id}
          pageSize={20}
          columns={[
            { key: 'a', header: 'Account', render: (l) => l.account },
            { key: 'd', header: 'Description', render: (l) => l.description },
            { key: 'c', header: 'Cost centre', render: (l) => l.department ?? '—' },
            { key: 'dr', header: 'Debit', align: 'right', render: (l) => (l.debit ? l.debit.toLocaleString() : '') },
            { key: 'cr', header: 'Credit', align: 'right', render: (l) => (l.credit ? l.credit.toLocaleString() : '') }
          ]}
        />
      </Panel>
      <Panel
        title="Bank transfer files (DME)"
        subtitle="Bank-specific layouts with header, detail and trailer control totals. Uploading to the bank portal is simulated."
        action={<SimulatedBadge what="bank portal upload" />}
      >
        <Toolbar>
          <select className="form-control" value={format} onChange={(e) => setFormat(e.target.value as BankFormat)} aria-label="Bank format">
            {Object.entries(BANK_FORMATS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input className="form-control" style={{ width: 200 }} value={debit} onChange={(e) => setDebit(e.target.value)} aria-label="Debit account" />
          <Btn primary disabled={!canEdit} onClick={generate}>
            Generate file
          </Btn>
        </Toolbar>
        <DataTable
          rows={dmeLogs.filter((l) => l.orgId === selectedOrgId)}
          rowKey={(l) => l.id}
          empty="No bank files generated yet."
          columns={[
            { key: 'id', header: 'File', render: (l) => `${l.id} · ${BANK_FORMATS[l.format].label}` },
            { key: 'p', header: 'Period', render: (l) => l.period },
            { key: 'n', header: 'Payments', align: 'right', render: (l) => l.lines },
            { key: 't', header: 'Total', align: 'right', render: (l) => kes(l.totalKes) },
            { key: 'h', header: 'Control hash', render: (l) => <code>{l.hash}</code> },
            { key: 'by', header: 'Generated', render: (l) => `${l.by}, ${l.at}` },
            { key: 's', header: 'Status', render: (l) => <StatusPill status={l.status} label={l.status === 'UPLOADED' ? `Uploaded · ${l.bankRef}` : undefined} /> },
            {
              key: 'u',
              header: 'Bank portal (simulated)',
              render: (l) =>
                l.status === 'GENERATED' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 120 }} placeholder="Bank ref" value={refs[l.id] ?? ''} onChange={(e) => setRefs({ ...refs, [l.id]: e.target.value })} />
                    <Btn disabled={!canEdit} onClick={() => markDmeUploaded(l.id, refs[l.id] ?? '')}>
                      Authorise upload
                    </Btn>
                  </span>
                ) : (
                  `by ${l.uploadedBy}`
                )
            }
          ]}
        />
      </Panel>
    </>
  );
};
