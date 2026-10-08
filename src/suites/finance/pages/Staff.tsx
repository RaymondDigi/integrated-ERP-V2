import React, { useState } from 'react';
import { HandCoins, Plus, Landmark, FileStack } from 'lucide-react';
import { useFinance } from '../store';
import { addMonths, fmtDate, kes, periodLabel, periodOf, permissions, round2, TODAY, MAIN_COMPANY } from '../engine';
import type { StaffLoan } from '../types';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Meter, Pill, Stat, Stepper, SuitePage } from '../../ui/kit';
import { WORKFORCE } from '../../../data/workforce';
import { usePrompt, num } from '../ext/ui';

type Tab = 'LOANS' | 'DEDUCTIONS';

/** Payables › Staff loans & advances: request, approval, disbursement and payroll recovery; payroll deduction bills. */
export const StaffPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const [tab, setTab] = useState<Tab>('LOANS');
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const open = state.staffLoans.find((l) => l.id === openId) ?? null;
  const recovered = (l: StaffLoan) => round2(l.recovered.reduce((x, r) => x + r.amount, 0));
  const live = state.staffLoans.filter((l) => l.status === 'POSTED' && recovered(l) < l.amount);
  const lastMonth = periodOf(addMonths(TODAY, -1));
  const deductionBills = state.documents.filter((d) => d.kind === 'BILL' && d.reference.startsWith('PAYROLL '));

  return (
    <SuitePage
      eyebrow="Payables"
      title="Staff loans & advances"
      subtitle="Staff debt from request to recovery through payroll, and statutory deductions billed to KRA, NSSF, SHA and the SACCO."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({
          title: 'New staff loan or advance',
          fields: [
            { key: 'emp', label: 'Employee', type: 'select', options: WORKFORCE.filter((e) => (e.orgId ?? MAIN_COMPANY) === MAIN_COMPANY).map((e) => ({ value: e.staffId, label: `${e.fullName} (${e.staffId})` })), span: 2 },
            { key: 'type', label: 'Type', type: 'select', options: [{ value: 'SALARY_ADVANCE', label: 'Salary advance' }, { value: 'STAFF_LOAN', label: 'Staff loan' }, { value: 'SURCHARGE', label: 'Surcharge (loss caused by staff)' }] },
            { key: 'amount', label: 'Amount', type: 'number', required: true },
            { key: 'monthly', label: 'Monthly recovery', type: 'number', required: true },
            { key: 'date', label: 'Date', type: 'date', initial: TODAY }
          ],
          onSubmit: (v) => f.requestLoan({ employeeId: v.emp, employee: WORKFORCE.find((e) => e.staffId === v.emp)?.fullName ?? v.emp, type: v.type as StaffLoan['type'], amount: num(v.amount), monthly: num(v.monthly), date: v.date })
        })}>
          <Plus size={14} /> New request
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Staff debt outstanding" value={kes(live.reduce((x, l) => x + l.amount - recovered(l), 0), { compact: true })} detail={`${live.length} loans and advances`} icon={<HandCoins size={16} />} />
        <Stat label="Waiting for approval" value={state.staffLoans.filter((l) => l.status === 'SUBMITTED').length} icon={<Landmark size={16} />} tone="gold" />
        <Stat label="Payroll deduction bills" value={deductionBills.length} detail="KRA, NSSF, SHA, SACCO" icon={<FileStack size={16} />} tone="blue" />
      </div>
      <Chips<Tab> value={tab} onChange={setTab} options={[{ value: 'LOANS', label: 'Loans & advances', count: state.staffLoans.length }, { value: 'DEDUCTIONS', label: 'Payroll deduction bills', count: deductionBills.length }]} />
      {tab === 'LOANS' && (
        <DataTable
          rows={state.staffLoans}
          rowKey={(l) => l.id}
          onRowClick={(l) => setOpenId(l.id)}
          columns={[
            { key: 'n', header: 'Number', render: (l) => <b className="sx-mono">{l.number}</b> },
            { key: 'e', header: 'Employee', render: (l) => <div className="sx-cell-main"><span>{l.employee}</span><small>{l.employeeId} · {l.type.replace('_', ' ').toLowerCase()}</small></div> },
            { key: 'a', header: 'Amount', render: (l) => kes(l.amount), align: 'right' },
            { key: 'm', header: 'Monthly', render: (l) => kes(l.monthly), align: 'right' },
            { key: 'r', header: 'Recovered', render: (l) => <div className="sx-meter-cell"><Meter value={l.amount ? recovered(l) / l.amount : 0} /><small>{kes(recovered(l), { compact: true })}</small></div> },
            { key: 's', header: 'Status', render: (l) => <Pill status={l.status === 'POSTED' && recovered(l) >= l.amount ? 'PAID' : l.status} label={l.status === 'POSTED' ? (recovered(l) >= l.amount ? 'Recovered' : 'Disbursed') : undefined} /> }
          ]}
        />
      )}
      {tab === 'DEDUCTIONS' && (
        <>
          <div className="sx-actions fx-bar">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
              title: 'Bill payroll deductions',
              subtitle: 'Creates supplier bills (submitted for approval) so the deductions are paid through the normal payment run.',
              fields: [
                { key: 'period', label: 'Payroll month (YYYY-MM)', initial: lastMonth },
                { key: 'paye', label: 'PAYE to KRA', type: 'number', initial: 412_000 },
                { key: 'nssf', label: 'NSSF', type: 'number', initial: 64_800 },
                { key: 'sha', label: 'SHIF to SHA', type: 'number', initial: 52_300 },
                { key: 'hl', label: 'Housing levy to KRA', type: 'number', initial: 38_900 },
                { key: 'sacco', label: 'SACCO deductions', type: 'number', initial: 96_000 }
              ],
              onSubmit: (v) =>
                f.postPayrollDeductionBills(v.period, [
                  { partyId: 's13', account: '2150', amount: num(v.paye), description: `PAYE ${periodLabel(v.period, true)}` },
                  { partyId: 's14', account: '2160', amount: num(v.nssf), description: `NSSF ${periodLabel(v.period, true)}` },
                  { partyId: 's15', account: '2160', amount: num(v.sha), description: `SHIF ${periodLabel(v.period, true)}` },
                  { partyId: 's13', account: '2160', amount: num(v.hl), description: `Affordable housing levy ${periodLabel(v.period, true)}` },
                  { partyId: 's16', account: '2200', amount: num(v.sacco), description: `SACCO deductions ${periodLabel(v.period, true)}` }
                ])
            })}>
              <FileStack size={14} /> Bill payroll deductions
            </button>
          </div>
          <DataTable
            rows={deductionBills}
            rowKey={(d) => d.id}
            onRowClick={(d) => f.setPage('bills', d.id)}
            columns={[
              { key: 'n', header: 'Bill', render: (d) => d.number },
              { key: 'p', header: 'Payee', render: (d) => state.parties.find((p) => p.id === d.partyId)?.name },
              { key: 'r', header: 'Payroll', render: (d) => d.reference },
              { key: 'l', header: 'For', render: (d) => d.lines[0]?.description },
              { key: 'a', header: 'Amount', render: (d) => kes(d.lines.reduce((x, l) => x + l.qty * l.price, 0)), align: 'right' },
              { key: 's', header: 'Status', render: (d) => <Pill status={d.status} /> }
            ]}
            empty="No payroll deduction bills yet"
          />
        </>
      )}
      {open && <LoanDrawer loan={open} onClose={() => setOpenId(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const LoanDrawer: React.FC<{ loan: StaffLoan; onClose: () => void }> = ({ loan, onClose }) => {
  const f = useFinance();
  const p = permissions(f.state, loan, f.actor);
  const prompt = usePrompt();
  const rec = round2(loan.recovered.reduce((x, r) => x + r.amount, 0));
  const lastMonth = periodOf(addMonths(TODAY, -1));
  return (
    <Drawer title={loan.number} subtitle={`${loan.employee} · ${loan.type.replace('_', ' ').toLowerCase()}`} badge={<Pill status={loan.status} />} onClose={onClose} wide>
      <DefList
        items={[
          ['Amount', kes(loan.amount)],
          ['Monthly recovery', kes(loan.monthly)],
          ['Recovered', `${kes(rec)} (${kes(round2(loan.amount - rec))} left)`],
          ['Requested', fmtDate(loan.date)],
          ['Disbursement', loan.disbursedJournalId ? f.state.journals.find((j) => j.id === loan.disbursedJournalId)?.number ?? 'Posted' : 'Not yet']
        ]}
      />
      {loan.recovered.length > 0 && (
        <ul className="fx-list">
          {loan.recovered.map((r) => (
            <li key={r.period}>
              {periodLabel(r.period, true)} — {kes(r.amount)}
            </li>
          ))}
        </ul>
      )}
      <ApprovalPanel
        steps={<Stepper status={loan.status} approvals={{ done: loan.approvals.length, needed: p.needed }} />}
        actions={[
          ...(p.submit ? [{ label: 'Submit', onClick: () => f.workflow('staffLoans', loan.id, 'submit') }] : []),
          ...(p.approve ? [{ label: 'Approve', onClick: () => f.workflow('staffLoans', loan.id, 'approve') }] : []),
          ...(loan.status === 'APPROVED' ? [{ label: loan.type === 'SURCHARGE' ? 'Raise surcharge' : 'Disburse', onClick: () => f.disburseLoan(loan.id) }] : []),
          ...(loan.status === 'POSTED' && rec < loan.amount
            ? [{ label: `Recover ${lastMonth} via payroll`, tone: 'secondary' as const, onClick: () => prompt.open({ title: 'Payroll recovery', fields: [{ key: 'period', label: 'Payroll month', initial: lastMonth }, { key: 'amount', label: 'Amount', type: 'number', initial: Math.min(loan.monthly, loan.amount - rec) }], onSubmit: (v) => f.recordRecovery(loan.id, v.period, num(v.amount)) }) }]
            : [])
        ]}
        canReject={p.reject}
        onReject={(note) => f.workflow('staffLoans', loan.id, 'reject', note).ok}
        notes={[p.reason]}
        actorLine={<>You are acting as <b>{f.actor.name}</b>. Prepared by {loan.preparedBy}.</>}
        history={loan.history}
      />
      {prompt.node}
    </Drawer>
  );
};
