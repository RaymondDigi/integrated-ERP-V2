import React, { useState } from 'react';
import { Repeat, Play, Layers, FileJson, Plus, PauseCircle } from 'lucide-react';
import { useFinance } from '../store';
import { docTotals, fmtDate, kes, lineNet, TODAY } from '../engine';
import type { RecurringDoc } from '../types';
import { Chips, DataTable, Field, Modal, Panel, Pill, SuitePage } from '../../ui/kit';
import { useLookups } from '../parts';
import { ExportCsvButton, ImportCsvButton } from '../../../platform/Widgets';
import { usePrompt, num, Simulated } from '../ext/ui';

type Tab = 'SCHEDULES' | 'BATCHES' | 'IMPORT';

const SAMPLE_EINVOICE = JSON.stringify(
  {
    supplierPin: 'P051060606N',
    invoiceNo: 'GFP-INV-88231',
    date: TODAY,
    po: 'PO-2026-118',
    lines: [
      { description: 'Tea packaging — 1kg foil bags', qty: 4000, price: 38, taxCode: 'V16', account: '5000' },
      { description: 'Delivery to Kericho factory', qty: 1, price: 12_500, taxCode: 'V16', account: '5100' }
    ]
  },
  null,
  2
);

/** Receivables / Payables › Recurring & batches: schedules, batch entry with control totals, and imports. */
export const RecurringPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const { party } = useLookups();
  const [tab, setTab] = useState<Tab>('SCHEDULES');
  const [editing, setEditing] = useState<RecurringDoc | null>(null);
  const [json, setJson] = useState(SAMPLE_EINVOICE);
  const prompt = usePrompt();
  const annual = (r: RecurringDoc) => r.lines.reduce((x, l) => x + lineNet(l), 0) * (r.frequency === 'MONTHLY' ? 12 : r.frequency === 'QUARTERLY' ? 4 : 1);
  const asResult = (r: { ok: boolean; error?: string }, n: number) => (r.ok ? { imported: n, errors: [] } : { imported: 0, errors: [(r as { error: string }).error] });

  return (
    <SuitePage
      eyebrow="Receivables & payables"
      title="Recurring & batches"
      subtitle="Rent, service contracts and retainers raised automatically; batch entry with control totals; imports from legacy systems and e-invoices."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => f.generateRecurring()}>
          <Play size={14} /> Run due schedules
        </button>
      }
    >
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'SCHEDULES', label: 'Recurring schedules', count: state.recurring.length },
          { value: 'BATCHES', label: 'Entry batches', count: state.invoiceBatches.length },
          { value: 'IMPORT', label: 'Imports & e-invoices' }
        ]}
      />
      {tab === 'SCHEDULES' && (
        <Panel
          title="Recurring invoice & payable listing"
          action={
            <div className="sx-actions">
              <ExportCsvButton name="recurring-listing" header={['Name', 'Type', 'Party', 'Frequency', 'Day', 'Start', 'End', 'Next run', 'Annual value', 'Active']} rows={() => state.recurring.map((r) => [r.name, r.kind, party(r.partyId)?.name ?? '', r.frequency, r.dayOfMonth, r.start, r.end ?? '', r.nextRun, annual(r), r.active ? 'Yes' : 'No'])} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: '', name: '', kind: 'BILL', partyId: '', lines: [{ id: 'l1', description: '', account: '6100', qty: 1, price: 0, vat: true, taxCode: 'V16', taxRate: 0.16 }], department: 'Administration', frequency: 'MONTHLY', dayOfMonth: 1, start: TODAY, nextRun: TODAY, notifyDaysBefore: 5, active: true, generated: [] })}>
                <Plus size={14} /> New schedule
              </button>
            </div>
          }
          flush
        >
          <DataTable
            rows={state.recurring}
            rowKey={(r) => r.id}
            onRowClick={setEditing}
            columns={[
              { key: 'n', header: 'Schedule', render: (r) => <div className="sx-cell-main"><span>{r.name}</span><small>{r.kind === 'BILL' ? 'Payable' : 'Invoice'} · {party(r.partyId)?.name}</small></div>, sort: (r) => r.name },
              { key: 'f', header: 'Frequency', render: (r) => `${r.frequency.toLowerCase()} on day ${r.dayOfMonth}` },
              { key: 'p', header: 'Period', render: (r) => `${fmtDate(r.start)} – ${r.end ? fmtDate(r.end) : 'open-ended'}` },
              { key: 'nx', header: 'Next run', render: (r) => fmtDate(r.nextRun), sort: (r) => r.nextRun },
              { key: 'nt', header: 'Reminder', render: (r) => `${r.notifyDaysBefore} days before` },
              { key: 'v', header: 'Per run', render: (r) => kes(docTotals(r).total), align: 'right' },
              { key: 'g', header: 'Generated', render: (r) => r.generated.length, align: 'right' },
              { key: 's', header: 'Status', render: (r) => <Pill status={r.active ? 'ACTIVE' : 'CLOSED'} label={r.active ? 'Active' : 'Paused'} /> }
            ]}
          />
        </Panel>
      )}
      {tab === 'BATCHES' && (
        <Panel
          title="Entry batches"
          subtitle="Open a batch with its control total, key the invoices or bills with the batch selected, then submit the whole batch once it balances."
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
              title: 'Open a batch',
              fields: [
                { key: 'kind', label: 'Documents', type: 'select', options: [{ value: 'BILL', label: 'Supplier bills' }, { value: 'INVOICE', label: 'Sales invoices' }] },
                { key: 'count', label: 'Number of documents', type: 'number', required: true },
                { key: 'total', label: 'Control total (incl. VAT)', type: 'number', required: true }
              ],
              onSubmit: (v) => f.saveInvoiceBatch({ kind: v.kind as 'BILL' | 'INVOICE', controlCount: num(v.count), controlTotal: num(v.total) })
            })}>
              <Layers size={14} /> Open batch
            </button>
          }
          flush
        >
          <DataTable
            rows={state.invoiceBatches}
            rowKey={(b) => b.id}
            columns={[
              { key: 'n', header: 'Batch', render: (b) => <b className="sx-mono">{b.number}</b> },
              { key: 'k', header: 'Type', render: (b) => (b.kind === 'BILL' ? 'Bills' : 'Invoices') },
              { key: 'c', header: 'Control', render: (b) => `${b.controlCount} · ${kes(b.controlTotal)}` },
              { key: 'e', header: 'Entered', render: (b) => { const st = f.batchStatus(b.id); return <span className={st.balanced ? 'sx-success-text' : 'sx-danger-text'}>{st.count} · {kes(st.total)}</span>; } },
              { key: 'h', header: 'Hold', render: (b) => (b.hold ? `On hold: ${b.hold.reason}` : '—') },
              {
                key: 'a',
                header: '',
                render: (b) => (
                  <div className="fx-row-actions">
                    <button type="button" className="sx-link" onClick={() => f.submitBatch(b.id)}>Submit batch</button>
                    {b.hold ? (
                      <button type="button" className="sx-link" onClick={() => f.releaseBatch(b.id)}>Release</button>
                    ) : (
                      <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Hold ${b.number}`, fields: [{ key: 'reason', label: 'Reason', required: true }], onSubmit: (v) => f.holdBatch(b.id, v.reason) })}>
                        <PauseCircle size={12} /> Hold
                      </button>
                    )}
                  </div>
                )
              }
            ]}
            empty="No batches open"
          />
        </Panel>
      )}
      {tab === 'IMPORT' && (
        <div className="sx-grid sx-grid-2">
          <Panel title="Load from legacy or remote systems" subtitle="CSV, one row per line; rows with the same reference become one document. Imported documents are drafts.">
            <div className="sx-actions">
              <ImportCsvButton label="Import invoices" template={['customer', 'date', 'due', 'reference', 'description', 'account', 'qty', 'price', 'vat']} onImport={(rows) => asResult(f.importDocuments('INVOICE', rows), rows.length)} />
              <ImportCsvButton label="Import bills" template={['supplier', 'date', 'due', 'reference', 'description', 'account', 'qty', 'price', 'vat', 'po', 'grn']} onImport={(rows) => asResult(f.importDocuments('BILL', rows), rows.length)} />
              <ImportCsvButton label="Import customers" template={['name', 'pin', 'email', 'phone', 'terms', 'credit limit', 'category']} onImport={(rows) => asResult(f.importParties('CUSTOMER', rows), rows.length)} />
              <ImportCsvButton label="Import suppliers" template={['name', 'pin', 'email', 'phone', 'terms', 'category']} onImport={(rows) => asResult(f.importParties('SUPPLIER', rows), rows.length)} />
            </div>
          </Panel>
          <Panel title="Receive a supplier e-invoice" subtitle={<Simulated what="KRA eTIMS supplier feed" />} action={<button type="button" className="btn btn-primary btn-sm" onClick={() => f.importEInvoice(json)}><FileJson size={14} /> Import e-invoice</button>}>
            <textarea className="form-control fx-code" rows={12} value={json} onChange={(e) => setJson(e.target.value)} aria-label="E-invoice JSON" />
          </Panel>
        </div>
      )}
      {editing && <ScheduleEditor value={editing} onClose={() => setEditing(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const ScheduleEditor: React.FC<{ value: RecurringDoc; onClose: () => void }> = ({ value, onClose }) => {
  const { state, saveRecurring } = useFinance();
  const [r, setR] = useState(value);
  const set = (p: Partial<RecurringDoc>) => setR((x) => ({ ...x, ...p }));
  const line = r.lines[0];
  const setLine = (p: Partial<RecurringDoc['lines'][number]>) => set({ lines: [{ ...line, ...p }, ...r.lines.slice(1)] });
  return (
    <Modal
      title={r.id ? r.name : 'New recurring schedule'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveRecurring(r).ok && onClose()}>
            <Repeat size={14} /> Save schedule
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Name" required span={2}>
          <input className="form-control" value={r.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={r.kind} onChange={(e) => set({ kind: e.target.value as RecurringDoc['kind'], partyId: '' })}>
            <option value="BILL">Payable (supplier)</option>
            <option value="INVOICE">Invoice (customer)</option>
          </select>
        </Field>
        <Field label="Party" required>
          <select className="form-control" value={r.partyId} onChange={(e) => set({ partyId: e.target.value })}>
            <option value="">Choose…</option>
            {state.parties.filter((p) => p.kind === (r.kind === 'BILL' ? 'SUPPLIER' : 'CUSTOMER')).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" span={2}>
          <input className="form-control" value={line.description} onChange={(e) => setLine({ description: e.target.value })} />
        </Field>
        <Field label="Account">
          <input className="form-control" value={line.account} onChange={(e) => setLine({ account: e.target.value })} />
        </Field>
        <Field label="Amount (excl. VAT)">
          <input className="form-control" type="number" value={line.price || ''} onChange={(e) => setLine({ price: Number(e.target.value) })} />
        </Field>
        <Field label="Frequency">
          <select className="form-control" value={r.frequency} onChange={(e) => set({ frequency: e.target.value as RecurringDoc['frequency'] })}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUAL">Annual</option>
          </select>
        </Field>
        <Field label="Day of month">
          <input className="form-control" type="number" value={r.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} />
        </Field>
        <Field label="Starts">
          <input className="form-control" type="date" value={r.start} onChange={(e) => set({ start: e.target.value, nextRun: r.id ? r.nextRun : e.target.value })} />
        </Field>
        <Field label="Ends">
          <input className="form-control" type="date" value={r.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />
        </Field>
        <Field label="Next run">
          <input className="form-control" type="date" value={r.nextRun} onChange={(e) => set({ nextRun: e.target.value })} />
        </Field>
        <Field label="Notify days before">
          <input className="form-control" type="number" value={r.notifyDaysBefore} onChange={(e) => set({ notifyDaysBefore: Number(e.target.value) })} />
        </Field>
        <Field label="Active">
          <input type="checkbox" checked={r.active} onChange={(e) => set({ active: e.target.checked })} />
        </Field>
      </div>
      {r.generated.length > 0 && <p className="sx-note">Generated so far: {r.generated.join(', ')}</p>}
    </Modal>
  );
};
