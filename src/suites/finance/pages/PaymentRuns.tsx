import React, { useState } from 'react';
import { Play, FileDown, Send, Ban, ListChecks, Plus } from 'lucide-react';
import { useFinance } from '../store';
import { addDays, curOf, docBalance, docTotals, fmtDate, kes, money, permissions, round2, TODAY } from '../engine';
import type { PaymentRun, Settlement } from '../types';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, FlowSteps, Pill, Stat, SuitePage } from '../../ui/kit';
import { useLookups } from '../parts';
import { PrintButton, esc } from '../../../platform/Widgets';
import { usePrompt, Simulated } from '../ext/ui';

type Tab = 'RUNS' | 'CHEQUES' | 'REQUIREMENTS' | 'MONITOR';

/** Payables › Payment runs: proposal by due date and bank, approval, execution, bank file (DME), advice and voids. */
export const PaymentRunsPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const { party } = useLookups();
  const [tab, setTab] = useState<Tab>('RUNS');
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const banks = state.accounts.filter((a) => a.bank);
  const run = state.paymentRuns.find((r) => r.id === openId) ?? null;
  const cheques = state.settlements.filter((s) => s.kind === 'PAYMENT' && s.chequeNo);
  const outstanding = cheques.filter((s) => s.status === 'POSTED' && !s.voided && !state.bankLines.some((l) => l.matchedTo?.startsWith(`${s.id}:`)));
  const voided = state.settlements.filter((s) => s.voided);
  const openBills = state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED' && docBalance(state, d) > 0.005);

  const newRun = () =>
    prompt.open({
      title: 'New payment proposal',
      subtitle: 'Picks posted bills due in the range (and any still inside an early-payment discount window) for one bank account.',
      fields: [
        { key: 'date', label: 'Payment date', type: 'date', initial: TODAY },
        { key: 'bank', label: 'Pay from', type: 'select', options: banks.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })) },
        { key: 'from', label: 'Due from', type: 'date', initial: addDays(TODAY, -365) },
        { key: 'to', label: 'Due to', type: 'date', initial: addDays(TODAY, 14) },
        { key: 'method', label: 'Method', type: 'select', options: ['EFT', 'RTGS', 'CHEQUE', 'M-PESA'].map((m) => ({ value: m, label: m })) },
        { key: 'suppliers', label: 'Only these suppliers', type: 'select', options: [{ value: '', label: 'All suppliers' }, ...state.parties.filter((p) => p.kind === 'SUPPLIER').map((p) => ({ value: p.id, label: p.name }))] }
      ],
      submitLabel: 'Propose',
      onSubmit: (v) => {
        const r = f.proposePaymentRun({ date: v.date, bankAccount: v.bank, dueFrom: v.from, dueTo: v.to, method: v.method as Settlement['method'], partyIds: v.suppliers ? [v.suppliers] : undefined });
        if (r.ok && r.id) setOpenId(r.id);
        return r;
      }
    });
  const voidCheque = (p: Settlement) =>
    prompt.open({
      title: `Void ${p.chequeNo ? `cheque ${p.chequeNo}` : p.number}`,
      fields: [
        { key: 'reason', label: 'Reason', required: true, initial: 'Cheque stopped' },
        { key: 'date', label: 'Void date', type: 'date', initial: TODAY }
      ],
      submitLabel: 'Void',
      onSubmit: (v) => f.voidPayment(p.id, v.reason, v.date)
    });

  const weekOf = (date: string) => (date < TODAY ? 'Overdue' : date <= addDays(TODAY, 7) ? 'This week' : date <= addDays(TODAY, 14) ? 'Next week' : date <= addDays(TODAY, 30) ? 'Within 30 days' : 'Later');
  const req = ['Overdue', 'This week', 'Next week', 'Within 30 days', 'Later'].map((w) => ({ w, bills: openBills.filter((d) => weekOf(d.dueDate) === w) }));

  return (
    <SuitePage
      eyebrow="Payables"
      title="Payment runs"
      subtitle="Choose the bank and due dates, review the proposal, approve, execute and send the payment file to the bank."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={newRun}>
          <Plus size={14} /> New payment run
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Bills open" value={openBills.length} detail={kes(openBills.reduce((x, d) => x + docBalance(state, d), 0), { compact: true })} icon={<ListChecks size={16} />} tone="blue" />
        <Stat label="Runs waiting" value={state.paymentRuns.filter((r) => r.status === 'SUBMITTED' || r.status === 'APPROVED').length} detail="approval or execution" icon={<Play size={16} />} tone="gold" />
        <Stat label="Outstanding cheques" value={outstanding.length} detail={kes(outstanding.reduce((x, s) => x + s.amount, 0), { compact: true })} icon={<FileDown size={16} />} tone="slate" />
        <Stat label="Voided payments" value={voided.length} detail="cheques and transfers" icon={<Ban size={16} />} tone="red" />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'RUNS', label: 'Runs', count: state.paymentRuns.length },
          { value: 'CHEQUES', label: 'Outstanding & voided cheques' },
          { value: 'REQUIREMENTS', label: 'Cash requirements' },
          { value: 'MONITOR', label: 'Payment monitor' }
        ]}
      />
      {tab === 'RUNS' && (
        <DataTable
          rows={state.paymentRuns}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          columns={[
            { key: 'n', header: 'Run', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number },
            { key: 'd', header: 'Pay on', render: (r) => fmtDate(r.date), sort: (r) => r.date },
            { key: 'b', header: 'Bank', render: (r) => `${r.bankAccount} · ${r.method}` },
            { key: 'c', header: 'Bills', render: (r) => r.proposals.filter((p) => p.include).length, align: 'right' },
            { key: 'a', header: 'Amount', render: (r) => kes(r.proposals.filter((p) => p.include).reduce((x, p) => x + p.amount, 0)), align: 'right' },
            { key: 'f', header: 'Bank file', render: (r) => (r.bankRef ? `Sent · ${r.bankRef}` : r.file ? r.file.name : '—') },
            { key: 's', header: 'Status', render: (r) => (r.voidReason ? <Pill status="VOID" label="Voided" /> : <Pill status={r.status} />) }
          ]}
          empty="No payment runs yet — start one to pay suppliers in bulk"
        />
      )}
      {tab === 'CHEQUES' && (
        <>
          <h4 className="sx-subhead">Outstanding cheques (not yet presented at the bank)</h4>
          <DataTable
            rows={outstanding}
            rowKey={(s) => s.id}
            columns={[
              { key: 'c', header: 'Cheque', render: (s) => <b className="sx-mono">{s.chequeNo}</b> },
              { key: 'n', header: 'Payment', render: (s) => s.number },
              { key: 'p', header: 'Payee', render: (s) => party(s.partyId)?.name },
              { key: 'd', header: 'Date', render: (s) => fmtDate(s.date), sort: (s) => s.date },
              { key: 'a', header: 'Amount', render: (s) => money(s.amount, curOf(s)), align: 'right' },
              { key: 'x', header: '', render: (s) => <button type="button" className="sx-link" onClick={() => voidCheque(s)}>Void</button> }
            ]}
            empty="No outstanding cheques"
          />
          <h4 className="sx-subhead">Voided cheques and payments</h4>
          <DataTable
            rows={voided}
            rowKey={(s) => s.id}
            columns={[
              { key: 'c', header: 'Cheque / ref', render: (s) => s.chequeNo ?? s.reference },
              { key: 'n', header: 'Payment', render: (s) => s.number },
              { key: 'p', header: 'Payee', render: (s) => party(s.partyId)?.name },
              { key: 'a', header: 'Amount', render: (s) => money(s.amount, curOf(s)), align: 'right' },
              { key: 'v', header: 'Voided', render: (s) => `${fmtDate(s.voided!.date)} by ${s.voided!.by}` },
              { key: 'r', header: 'Reason', render: (s) => s.voided!.reason }
            ]}
            empty="Nothing has been voided"
          />
        </>
      )}
      {tab === 'REQUIREMENTS' && (
        <DataTable
          rows={req}
          rowKey={(r) => r.w}
          columns={[
            { key: 'w', header: 'Due', render: (r) => <b>{r.w}</b> },
            { key: 'n', header: 'Bills', render: (r) => r.bills.length, align: 'right' },
            { key: 'a', header: 'Amount (KES)', render: (r) => kes(r.bills.reduce((x, d) => x + docBalance(state, d) * (d.fxRate ?? 1), 0)), align: 'right' },
            { key: 'h', header: 'On hold', render: (r) => r.bills.filter((d) => d.hold || party(d.partyId)?.paymentHold).length, align: 'right' },
            { key: 'disc', header: 'Discounts available', render: (r) => kes(round2(r.bills.reduce((x, d) => { const t = d.earlyDiscount ?? party(d.partyId)?.earlyDiscount; return x + (t && addDays(d.date, t.days) >= TODAY ? docTotals(d).net * (t.pct / 100) : 0); }, 0))), align: 'right' }
          ]}
        />
      )}
      {tab === 'MONITOR' && (
        <DataTable
          rows={state.settlements.filter((s) => s.kind === 'PAYMENT')}
          rowKey={(s) => s.id}
          initialSort={{ key: 'd', dir: 'desc' }}
          columns={[
            { key: 'n', header: 'Payment', render: (s) => <b className="sx-mono">{s.number}</b>, sort: (s) => s.number },
            { key: 'p', header: 'Supplier', render: (s) => party(s.partyId)?.name },
            { key: 'd', header: 'Date', render: (s) => fmtDate(s.date), sort: (s) => s.date },
            { key: 'a', header: 'Amount', render: (s) => money(s.amount, curOf(s)), align: 'right' },
            { key: 'r', header: 'Run', render: (s) => state.paymentRuns.find((r) => r.id === s.runId)?.number ?? 'Manual' },
            { key: 'bk', header: 'Bank', render: (s) => (s.voided ? 'Voided' : s.bankStatus ? `${s.bankStatus.status.toLowerCase()} · ${s.bankStatus.ref}` : s.status === 'POSTED' ? 'Not sent' : '—') },
            { key: 'rec', header: 'Reconciled', render: (s) => (state.bankLines.some((l) => l.matchedTo?.startsWith(`${s.id}:`)) ? 'Yes' : 'No') },
            { key: 's', header: 'Status', render: (s) => <Pill status={s.voided ? 'VOID' : s.status} /> }
          ]}
        />
      )}
      {run && <RunDrawer run={run} onClose={() => setOpenId(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const RunDrawer: React.FC<{ run: PaymentRun; onClose: () => void }> = ({ run, onClose }) => {
  const f = useFinance();
  const { state, actor } = f;
  const { party } = useLookups();
  const prompt = usePrompt();
  const p = permissions(state, run, actor);
  const editable = run.status === 'DRAFT' || run.status === 'REJECTED';
  const inc = run.proposals.filter((x) => x.include);
  const total = round2(inc.reduce((x, y) => x + y.amount, 0));
  const bill = (id: string) => state.documents.find((d) => d.id === id);
  const at = run.status === 'DRAFT' || run.status === 'REJECTED' ? 0 : run.status === 'SUBMITTED' ? 1 : run.status === 'APPROVED' ? 2 : run.bankRef ? 4 : 3;
  const preCheck = () =>
    `<h1>Pre-check-run edit report — ${esc(run.number)}</h1><p>Pay on ${esc(run.date)} from ${esc(run.bankAccount)} by ${esc(run.method)} · bills due ${esc(run.dueFrom)} to ${esc(run.dueTo)}</p><table><tr><th>Supplier</th><th>Bill</th><th>Due</th><th class="r">Discount</th><th class="r">Pay</th><th>Included</th><th>Note</th></tr>${run.proposals
      .map((x) => `<tr><td>${esc(party(x.partyId)?.name)}</td><td>${esc(bill(x.billId)?.number)} ${esc(bill(x.billId)?.reference)}</td><td>${esc(bill(x.billId)?.dueDate)}</td><td class="r">${x.discount.toLocaleString()}</td><td class="r">${x.amount.toLocaleString()}</td><td>${x.include ? 'Yes' : 'No'}</td><td>${esc(x.note ?? '')}</td></tr>`)
      .join('')}</table><p><b>Total to pay: ${total.toLocaleString()}</b></p>`;
  const actions = [
    ...(p.submit ? [{ label: 'Submit for approval', icon: <Send size={14} />, onClick: () => f.workflow('paymentRuns', run.id, 'submit') }] : []),
    ...(p.approve ? [{ label: 'Approve', onClick: () => f.workflow('paymentRuns', run.id, 'approve') }] : []),
    ...(run.status === 'APPROVED' ? [{ label: 'Execute run', icon: <Play size={14} />, onClick: () => f.executeRun(run.id) }] : []),
    ...(run.status === 'POSTED' && !run.voidReason
      ? [
          { label: 'Bank file CSV', tone: 'secondary' as const, icon: <FileDown size={14} />, onClick: () => f.generateBankFile(run.id, 'CSV') },
          { label: 'ISO 20022 pain.001', tone: 'secondary' as const, icon: <FileDown size={14} />, onClick: () => f.generateBankFile(run.id, 'PAIN001') },
          { label: 'SWIFT MT103', tone: 'secondary' as const, icon: <FileDown size={14} />, onClick: () => f.generateBankFile(run.id, 'MT103') },
          ...(run.file && !run.bankRef ? [{ label: 'Send to bank', icon: <Send size={14} />, onClick: () => f.sendToBank(run.id) }] : []),
          { label: 'Void run', tone: 'danger' as const, icon: <Ban size={14} />, onClick: () => prompt.open({ title: `Void ${run.number}`, fields: [{ key: 'reason', label: 'Reason', required: true }, { key: 'date', label: 'Void date', type: 'date', initial: TODAY }], onSubmit: (v) => f.voidRun(run.id, v.reason, v.date) }) }
        ]
      : []),
    ...(p.void && run.status !== 'POSTED' && run.status !== 'VOID' ? [{ label: 'Cancel', tone: 'ghost' as const, onClick: () => f.workflow('paymentRuns', run.id, 'void') }] : [])
  ];
  return (
    <Drawer title={run.number} subtitle={`${run.method} from ${run.bankAccount} on ${fmtDate(run.date)}`} badge={<Pill status={run.status} />} onClose={onClose} wide footer={<PrintButton title={`Pre-check ${run.number}`} html={preCheck} label="Pre-check edit report" />}>
      <DefList
        items={[
          ['Bills due', `${fmtDate(run.dueFrom)} – ${fmtDate(run.dueTo)}`],
          ['Included', `${inc.length} of ${run.proposals.length} bills`],
          ['Total', kes(total)],
          ['Cheques from', run.chequeStart ? String(run.chequeStart) : '—'],
          ['Bank file', run.file ? `${run.file.name} (${run.file.at})` : 'Not generated'],
          ['Bank transmission', run.bankRef ? <span key="b">{run.bankRef} <Simulated what="host-to-host bank link" /></span> : '—']
        ]}
      />
      <DataTable
        rows={run.proposals}
        rowKey={(x) => x.billId}
        pageSize={30}
        columns={[
          { key: 'i', header: 'Pay', render: (x) => <input type="checkbox" checked={x.include} disabled={!editable} onChange={(e) => f.updateProposal(run.id, x.billId, { include: e.target.checked })} aria-label={`Include ${bill(x.billId)?.number}`} /> },
          { key: 's', header: 'Supplier', render: (x) => <div className="sx-cell-main"><span>{party(x.partyId)?.name}</span><small>{x.note ?? ''}</small></div> },
          { key: 'b', header: 'Bill', render: (x) => `${bill(x.billId)?.number} · ${bill(x.billId)?.reference}` },
          { key: 'd', header: 'Due', render: (x) => fmtDate(bill(x.billId)?.dueDate ?? '') },
          { key: 'disc', header: 'Discount', render: (x) => (x.discount ? x.discount.toLocaleString() : '—'), align: 'right' },
          { key: 'a', header: 'Amount', render: (x) => (editable ? <input className="form-control fx-num" type="number" defaultValue={x.amount} onBlur={(e) => Number(e.target.value) !== x.amount && f.updateProposal(run.id, x.billId, { amount: Number(e.target.value) })} aria-label="Amount" /> : x.amount.toLocaleString()), align: 'right' }
        ]}
      />
      <ApprovalPanel
        steps={<FlowSteps steps={['Proposed', 'Submitted', 'Approved', 'Executed', 'Sent to bank']} at={at} off={!!run.voidReason || run.status === 'VOID'} />}
        actions={actions}
        canReject={p.reject}
        onReject={(note) => f.workflow('paymentRuns', run.id, 'reject', note).ok}
        notes={[p.reason, run.voidReason && `Voided: ${run.voidReason}`]}
        actorLine={<>You are acting as <b>{actor.name}</b>. Prepared by {run.preparedBy}.</>}
        history={run.history}
      />
      {prompt.node}
    </Drawer>
  );
};
