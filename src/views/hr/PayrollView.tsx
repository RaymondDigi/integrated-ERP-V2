import React, { useMemo, useState } from 'react';
import {
  Coins,
  ArrowLeft,
  Play,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ChevronRight,
  Cpu,
  ClipboardList,
  Send,
  FileText,
  Layers,
  Zap,
  CheckCircle2,
  BookOpen,
  AlertTriangle,
  Settings2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useFinance } from '../../suites/finance/store';
import { calculateKenyanStatutory } from '../../utils/statutory';
import { PayrollItems } from './payroll/PayrollItems';
import { PayrollLoans } from './payroll/PayrollLoans';
import { PayslipRegister } from './payroll/PayslipRegister';
import { CompanySummaries } from './payroll/CompanySummaries';
import { CustomSummaries } from './payroll/CustomSummaries';
import { StatutoryRates } from './payroll/StatutoryRates';
import { PayItemSetup } from './payroll/PayItemSetup';
import { PayrollWorksheet } from './payroll/PayrollWorksheet';
import { downloadCsv, kes, payRail, periodOf, rowsFor } from './payroll/reports';
import { Pager, usePaged } from '../../components/common/Pager';
import { PeriodTag } from './payroll/shared';

// Re-exported for screens that import it from here
export { calculateKenyanStatutory };

const TABS = [
  { id: 'console', label: 'Payroll console', icon: Coins },
  { id: 'worksheet', label: 'Payroll worksheet', icon: FileSpreadsheet },
  { id: 'items', label: 'Payroll items', icon: ClipboardList },
  { id: 'setup', label: 'Pay item setup', icon: Settings2 },
  { id: 'loans', label: 'Loans & advances', icon: Send },
  { id: 'payslips', label: 'Payslips & register', icon: FileText },
  { id: 'summaries', label: 'Reports & summaries', icon: Layers },
  { id: 'custom', label: 'Custom summaries', icon: Layers },
  { id: 'statutory', label: 'Statutory rates', icon: Zap }
];

const PayrollConsole: React.FC<{ goTab: (t: string) => void }> = ({ goTab }) => {
  const {
    tenantPayrollBatches,
    runPayrollBatch,
    addToast,
    openRightDrawer,
    hrEmployees,
    selectedOrgId,
    payrollOpenPeriod,
    payrollCtx,
    payItems,
    setPayrollBatchStatus,
    payrollGlRefs,
    activeTenant
  } = useApp();
  const finance = useFinance();

  // Highlights come from the same batches as the table below
  const highlights = useMemo(() => {
    const monthly = tenantPayrollBatches.filter((b) => b.pipeline === 'Monthly Payroll');
    const weekly = tenantPayrollBatches.filter((b) => b.pipeline === 'Weekly Payroll');
    const lastPosted = monthly.find((b) => b.status === 'POSTED_GL');
    return {
      lastPosted,
      weeklyWorkers: weekly[0]?.workerCount ?? 0,
      weeklyGross: weekly[0]?.totalGrossKes ?? 0,
      sites: new Set(tenantPayrollBatches.map((b) => b.branch)).size
    };
  }, [tenantPayrollBatches]);
  const kesM = (n: number) => (n >= 1_000_000 ? `KES ${(n / 1_000_000).toFixed(2)}M` : `KES ${Math.round(n / 1000).toLocaleString()}K`);

  // The open period, worked out payslip by payslip
  const open = periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month);
  const rows = useMemo(
    () => rowsFor(hrEmployees, [selectedOrgId], periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month), payrollCtx),
    [hrEmployees, selectedOrgId, payrollOpenPeriod.year, payrollOpenPeriod.month, payrollCtx]
  );
  const salaried = rows.filter((r) => !r.p.casual);
  const sum = (k: (r: (typeof rows)[number]) => number, list = rows) => list.reduce((s, r) => s + k(r), 0);
  const batch = tenantPayrollBatches.find((b) => b.pipeline === 'Monthly Payroll' && b.id.includes(open.key));
  const items = payItems.filter((i) => i.orgId === selectedOrgId && i.status === 'ACTIVE' && (i.recurring ? i.period <= open.key && (!i.endPeriod || i.endPeriod >= open.key) : i.period === open.key));
  const flagged = rows.filter((r) => r.p.warnings.length);
  const deferred = sum((r) => r.p.deductions.reduce((s, d) => s + d.deferred, 0));
  const leavers = rows.filter((r) => r.p.exit);
  const statutoryDue = (b?: (typeof tenantPayrollBatches)[number]) => (b ? b.totalPayeKes + 2 * b.totalNssfKes + b.totalShifKes + 2 * b.totalAhlKes : 0);

  const approve = () => {
    if (!batch) return;
    setPayrollBatchStatus(batch.id, 'AUDIT_APPROVED');
    addToast({ type: 'success', title: 'Payroll approved', message: `${open.label} approved by David Otieno, Finance Manager. Ready to post to the ledger.` });
  };
  const postToLedger = () => {
    if (!batch) return;
    const s = salaried;
    const gross = sum((r) => r.p.gross, s);
    const er = sum((r) => r.p.employerNssf + r.p.employerAhl + r.p.nita, s);
    const statEe = sum((r) => r.p.nssf + r.p.shif + r.p.ahl, s);
    const other = sum((r) => r.p.pretaxCash + r.p.deductions.reduce((x, d) => x + d.deducted, 0), s);
    const res = finance.saveJournal({
      date: `${open.key}-25`,
      memo: `Payroll — ${open.label} (from Employee Payroll, ${s.length} salaried staff, batch ${batch.batchNo})`,
      lines: [
        { id: 'l1', account: '6000', description: 'Gross salaries, allowances and overtime', debit: gross, credit: 0, department: 'Administration' },
        { id: 'l2', account: '6000', description: 'Employer NSSF, housing levy and NITA', debit: er, credit: 0, department: 'Administration' },
        { id: 'l3', account: '2150', description: 'PAYE withheld', debit: 0, credit: sum((r) => r.p.paye, s) },
        { id: 'l4', account: '2160', description: 'NSSF, SHIF, housing levy and NITA (employee and employer)', debit: 0, credit: statEe + er },
        { id: 'l5', account: '2200', description: 'Pension, loans, SACCO and other deductions', debit: 0, credit: other },
        { id: 'l6', account: '1000', description: 'Net pay — bank transfer and M-Pesa', debit: 0, credit: sum((r) => r.p.net, s) }
      ]
    });
    if ('error' in res) {
      addToast({ type: 'error', title: 'Could not post to the ledger', message: res.error });
      return;
    }
    const jv = finance.snapshot().journals.find((j) => j.id === res.id)?.number ?? res.id ?? '';
    setPayrollBatchStatus(batch.id, 'POSTED_GL', jv);
    addToast({ type: 'success', title: 'Payroll posted', message: `Journal ${jv} sent to Finance for approval. ${open.label} is closed — new items go to the next period.` });
  };

  const exportItax = () =>
    downloadCsv(
      `KRA P10 ${activeTenant.name} ${open.label}`,
      ['KRA PIN', 'Employee', 'Residential status', 'Employment', 'Gross pay', 'Benefits', 'NSSF', 'SHIF', 'Housing levy', 'Pension', 'Mortgage interest', 'Taxable pay', 'Tax charged', 'Personal relief', 'Housing relief', 'Insurance relief', 'PAYE'],
      rows.map((r) => [
        r.e.kraPinMasked,
        r.e.fullName,
        'Resident',
        r.e.tax?.employment === 'SECONDARY' ? 'Secondary' : 'Primary',
        r.p.gross,
        r.p.benefitsInKind,
        r.p.nssf,
        r.p.shif,
        r.p.ahl,
        r.p.tax.pensionAllowed,
        r.p.tax.mortgageAllowed,
        Math.round(r.p.tax.taxablePay),
        Math.round(r.p.tax.grossTax),
        r.p.tax.personalRelief,
        Math.round(r.p.tax.housingRelief),
        Math.round(r.p.tax.insuranceRelief),
        r.p.paye
      ])
    );
  const exportBank = () =>
    downloadCsv(
      `Net pay transfers ${activeTenant.name} ${open.label}`,
      ['Rail', 'Staff ID', 'Employee', 'Account / phone', 'Amount', 'Narration'],
      rows.map((r) => [payRail(r.e), r.e.staffId, r.e.fullName, payRail(r.e) === 'M-Pesa' ? r.e.mpesaPhoneMasked : r.e.bankAccountMasked, r.p.net, `Salary ${open.label}`])
    );

  // Surgical runs for one site
  const branches = [...new Set(hrEmployees.filter((e) => e.orgId === selectedOrgId).map((e) => [e.branch, e.block].filter(Boolean).join(' — ')))];
  const [selectedPipeline, setSelectedPipeline] = useState<'Monthly Payroll' | 'Weekly Payroll'>('Monthly Payroll');
  const [selectedBranch, setSelectedBranch] = useState(branches[0] ?? '');
  const [isExecuting, setIsExecuting] = useState(false);
  const handleExecuteBatch = () => {
    setIsExecuting(true);
    setTimeout(() => {
      runPayrollBatch(selectedBranch, selectedPipeline);
      setIsExecuting(false);
    }, 900);
  };

  // Only the open period is live; everything else is a previous (paid) period
  const isActiveBatch = (b: (typeof tenantPayrollBatches)[number]) =>
    b.pipeline === 'Monthly Payroll' ? b.id.includes(open.key) : b.status === 'CALCULATED';
  const activeBatches = tenantPayrollBatches.filter(isActiveBatch);
  const pastBatches = tenantPayrollBatches.filter((b) => !isActiveBatch(b));
  const batchPage = usePaged(pastBatches, 10, selectedOrgId);
  const batchCard = (title: string, sub: string, list: typeof tenantPayrollBatches, rows: typeof tenantPayrollBatches, empty: string, pager?: React.ReactNode) => (
      <div className="hr-table-card">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{title}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {sub}
            </span>
          </div>
          <div className="pr-table-scroll">
            <table className="hr-table pr-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Period &amp; branch</th>
                  <th>Pipeline</th>
                  <th className="num">Workers</th>
                  <th className="num">Gross</th>
                  <th className="num">PAYE</th>
                  <th className="num">NSSF / SHIF / AHL</th>
                  <th className="num">Net</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                      {empty}
                    </td>
                  </tr>
                ) : (
                  rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{b.batchNo}</strong>
                        {payrollGlRefs[b.id] && <div className="muted">Ledger {payrollGlRefs[b.id]}</div>}
                      </td>
                      <td>
                        {b.period}
                        <div className="muted">{b.branch}</div>
                      </td>
                      <td>
                        <span className="digicraft-badge-light">{b.pipeline}</span>
                      </td>
                      <td className="num">{b.workerCount}</td>
                      <td className="num">
                        <strong>{kes(b.totalGrossKes)}</strong>
                      </td>
                      <td className="num" style={{ color: '#dc2626' }}>
                        {kes(b.totalPayeKes)}
                      </td>
                      <td className="num">
                        {kes(b.totalNssfKes)}
                        <div className="muted">
                          {kes(b.totalShifKes)} · {kes(b.totalAhlKes)}
                        </div>
                      </td>
                      <td className="num">
                        <strong style={{ color: '#059669' }}>{kes(b.totalNetDisbursementKes)}</strong>
                      </td>
                      <td>
                        <span className={`digicraft-status-pill ${b.status === 'DISBURSED_MPESA' || b.status === 'POSTED_GL' ? 'success' : b.status === 'AUDIT_APPROVED' ? 'primary' : 'info'}`}>
                          {b.status === 'POSTED_GL' ? 'Posted' : b.status === 'AUDIT_APPROVED' ? 'Approved' : b.status === 'DISBURSED_MPESA' ? 'Paid (M-Pesa)' : b.status === 'CALCULATED' ? 'Calculated' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => openRightDrawer('payroll', b)}>
                          Actions →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {pager}
        </div>
  );

  const step = !batch ? 0 : batch.status === 'CALCULATED' ? 1 : batch.status === 'AUDIT_APPROVED' ? 2 : 3;
  const steps = ['Inputs posted', 'Calculated', 'Approved', 'Posted to ledger'];

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Active period — {open.label}</div>
          <div className="hr-stat-value">{kesM(sum((r) => r.p.gross, salaried))}</div>
          <div className="hr-stat-subtext">{salaried.length} salaried staff · gross</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Weekly payroll</div>
          <div className="hr-stat-value" style={{ color: '#059669' }}>
            {kesM(highlights.weeklyGross)}
          </div>
          <div className="hr-stat-subtext">{highlights.weeklyWorkers} daily-rated workers this week · M-Pesa</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Statutory remittance due</div>
          <div className="hr-stat-value" style={{ color: '#237857' }}>
            {kesM(statutoryDue(highlights.lastPosted) + (highlights.lastPosted?.workerCount ?? 0) * 50)}
          </div>
          <div className="hr-stat-subtext">PAYE, NSSF, SHIF, levy and NITA{highlights.lastPosted ? ` · ${highlights.lastPosted.period}, by the 9th` : ''}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Cost to company</div>
          <div className="hr-stat-value" style={{ color: '#10b981' }}>
            {kesM(sum((r) => r.p.costToCompany))}
          </div>
          <div className="hr-stat-subtext">
            {open.label} · {rows.length} people incl. daily-rated
          </div>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>
              Active payroll period — {open.label} <PeriodTag periodKey={open.key} />
            </h3>
            <p>
              Pay date 25 {open.label}. Prepared by Rose Chepkoech; approved by Finance; posted to the ledger as a journal for Finance to approve.
            </p>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-secondary" onClick={() => goTab('items')}>
              <ClipboardList size={15} /> Post items
            </button>
            <button className="btn btn-secondary" onClick={() => goTab('payslips')}>
              <FileText size={15} /> Review payslips
            </button>
            {batch?.status === 'CALCULATED' && (
              <button className="btn btn-primary" onClick={approve}>
                <CheckCircle2 size={15} /> Approve
              </button>
            )}
            {batch?.status === 'AUDIT_APPROVED' && (
              <button className="btn btn-primary" onClick={postToLedger}>
                <BookOpen size={15} /> Post to ledger
              </button>
            )}
          </div>
        </div>
        <div className="pr-tabstrip" style={{ marginBottom: 14, background: 'transparent', border: 'none', padding: 0 }}>
          {steps.map((s, i) => (
            <button key={s} className={i <= step ? 'active' : ''} style={{ cursor: 'default' }}>
              {i < step ? <CheckCircle2 size={13} /> : <span style={{ width: 13, textAlign: 'center' }}>{i + 1}</span>} {s}
            </button>
          ))}
        </div>
        <div className="pr-kv">
          <div>
            <span>Payroll items</span>
            <strong>{items.length}</strong>
            <small>{items.filter((i) => !i.recurring).length} one-off this month</small>
          </div>
          <div>
            <span>Gross / net</span>
            <strong>KES {kes(sum((r) => r.p.gross))}</strong>
            <small>Net KES {kes(sum((r) => r.p.net))}</small>
          </div>
          <div>
            <span>PAYE</span>
            <strong>KES {kes(sum((r) => r.p.paye))}</strong>
            <small>after reliefs of KES {kes(sum((r) => r.p.tax.personalRelief + r.p.tax.housingRelief + r.p.tax.insuranceRelief + r.p.tax.pmfRelief))}</small>
          </div>
          <div>
            <span>Leavers</span>
            <strong>{leavers.length}</strong>
            <small>{leavers.map((r) => r.e.fullName.split(' ')[0]).join(', ') || 'none'} — final dues</small>
          </div>
          <div>
            <span>Deferred deductions</span>
            <strong style={{ color: deferred ? '#d97706' : undefined }}>KES {kes(deferred)}</strong>
            <small>held back by the ⅔ limit</small>
          </div>
          {batch?.status === 'POSTED_GL' && payrollGlRefs[batch.id] && (
            <div>
              <span>Ledger</span>
              <strong>{payrollGlRefs[batch.id]}</strong>
              <small>Draft journal in Finance</small>
            </div>
          )}
        </div>
        {flagged.length > 0 && (
          <div className="pr-note warn" style={{ marginTop: 12 }}>
            <strong>
              <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {flagged.length} payslips to check before approval:
            </strong>
            {flagged.slice(0, 6).map((r) => (
              <div key={r.e.staffId}>
                • {r.e.fullName}: {r.p.warnings.join('; ')}
              </div>
            ))}
            {flagged.length > 6 && <div>… and {flagged.length - 6} more in Payslips &amp; register.</div>}
          </div>
        )}
        <div className="pr-toolbar" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={exportItax}>
            <Download size={15} /> KRA P10 (CSV)
          </button>
          <button className="btn btn-secondary" onClick={exportBank}>
            <FileSpreadsheet size={15} /> Bank &amp; M-Pesa transfer file
          </button>
          <button className="btn btn-secondary" onClick={() => goTab('summaries')}>
            <Layers size={15} /> Summaries
          </button>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={18} color="var(--brand-primary)" />
            <div>
              <h3>Run one site separately</h3>
              <p>Calculate a single branch or unit without locking the whole company’s payroll.</p>
            </div>
          </div>
        </div>
        <div className="pr-toolbar">
          <select className="form-control" value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value as 'Monthly Payroll' | 'Weekly Payroll')} aria-label="Pay frequency">
            <option value="Monthly Payroll">Monthly payroll (bank transfer)</option>
            <option value="Weekly Payroll">Weekly payroll (M-Pesa)</option>
          </select>
          <select className="form-control grow" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} aria-label="Site">
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleExecuteBatch} disabled={isExecuting}>
            {isExecuting ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            <span>{isExecuting ? 'Calculating…' : 'Run site'}</span>
          </button>
        </div>
      </div>

      {batchCard(`Active payroll period — ${open.label}`, 'Being prepared now: post items, approve and post to the ledger', activeBatches, activeBatches, 'Nothing calculated for the active period yet.')}
      {batchCard(
        'Previous payroll periods',
        `${pastBatches.length} paid or closed batches across ${highlights.sites} site${highlights.sites === 1 ? '' : 's'}`,
        pastBatches,
        batchPage.rows,
        'No earlier batches.',
        <Pager p={batchPage} noun="batches" />
      )}
    </>
  );
};

export const PayrollView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, payrollOpenPeriod } = useApp();
  const tab = moduleTabs['payroll'] ?? 'console';
  const goTab = (t: string) => setModuleTab('payroll', t);

  return (
    <div className="hr-app-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #07</span>
          </div>
          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #22c55e, #15803d)' }}>
              <Coins size={22} />
            </div>
            <div>
              <h1>
                <span>Employee Payroll &amp; Statutory Platform</span>
                <span className="digicraft-badge-light">Process #07</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                Open period {payrollOpenPeriod.label} · PAYE, NSSF, SHIF, housing levy and NITA from dated rate tables · items, loans, payslips and summaries.
              </p>
            </div>
          </div>
        </div>
        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('performance')}>
            <span>Go to Performance (#08)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Payroll sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => goTab(t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'console' && <PayrollConsole goTab={goTab} />}
      {tab === 'worksheet' && <PayrollWorksheet />}
      {tab === 'items' && <PayrollItems />}
      {tab === 'setup' && <PayItemSetup />}
      {tab === 'loans' && <PayrollLoans />}
      {tab === 'payslips' && <PayslipRegister />}
      {tab === 'summaries' && <CompanySummaries />}
      {tab === 'custom' && <CustomSummaries />}
      {tab === 'statutory' && <StatutoryRates />}
    </div>
  );
};
