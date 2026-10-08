import React, { useMemo, useState } from 'react';
import { CalendarRange, Landmark, Plus, Target, Wallet } from 'lucide-react';
import { useCommercial } from '../store';
import { kes, round2 } from '../../finance/engine';
import { DEPARTMENTS } from '../../finance/data';
import { ExportCsvButton } from '../../../platform/Widgets';
import { Drawer, Empty, Field, Meter, Modal, Pill, Stat, SuitePage, Timeline } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { planActual } from './ext/engine';
import { label, ReadOnlyNote, Tabs } from './ext/ui';
import type { PlanLine } from './ext/types';

const METHODS: PlanLine['method'][] = ['RFQ', 'RFP', 'DIRECT', 'FRAMEWORK', 'AUCTION'];

export const PlanPage: React.FC = () => {
  const ext = useProcurementExt();
  const com = useCommercial();
  const [tab, setTab] = useState<'plan' | 'budget'>('plan');
  const [edit, setEdit] = useState<(Omit<PlanLine, 'id'> & { id?: string }) | null>(null);
  const [note, setNote] = useState('');
  const [drill, setDrill] = useState<string | null>(null);
  const plan = ext.state.plan;
  const pa = useMemo(() => planActual(ext.state, com.state), [ext.state, com.state]);
  const planned = round2(plan.lines.reduce((a, l) => a + l.estValue, 0));
  const actual = round2(pa.reduce((a, r) => a + r.actual, 0));
  const fin = ext.ctx.fin;
  const accounts = [...new Set(fin.state.budgets.map((b) => b.account))].filter((a) => /^[156]/.test(a));
  const positions = accounts.map((a) => ({ name: fin.state.accounts.find((x) => x.code === a)?.name ?? a, ...ext.budgetFor({ lines: [] }, a) }));
  const cats = [...new Set(com.state.products.filter((p) => p.kind !== 'GOODS').map((p) => p.category))];
  const blank: Omit<PlanLine, 'id'> = { category: cats[0] ?? 'Packaging', description: '', department: 'Operations', qty: 0, estValue: 0, quarter: 1, method: 'RFQ' };
  const drilled = positions.find((p) => p.account === drill);
  return (
    <SuitePage
      eyebrow="Planning"
      title={`Procurement plan ${plan.year}`}
      subtitle="The annual plan of what will be bought, when and how, approved by the Finance Director and tracked against actual orders; budget lines show what is spent, committed and still free."
      actions={
        tab === 'plan' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit(blank)}>
            <Plus size={15} /> Add plan line
          </button>
        )
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Planned spend" value={kes(planned, { compact: true })} detail={`${plan.lines.length} lines`} icon={<CalendarRange size={17} />} />
        <Stat label="Ordered against plan" value={kes(actual, { compact: true })} detail={planned ? `${Math.round((actual / planned) * 100)}% used` : ''} icon={<Target size={17} />} tone="blue" />
        <Stat label="Plan status" value={label(plan.status)} detail={plan.approvals[0] ? `by ${plan.approvals[0].by}` : 'Not yet approved'} icon={<Landmark size={17} />} tone={plan.status === 'APPROVED' ? 'green' : 'gold'} />
        <Stat label="Budget lines over" value={positions.filter((p) => p.hasBudget && p.available < 0).length} icon={<Wallet size={17} />} tone="red" onClick={() => setTab('budget')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['plan', 'Plan vs actual', plan.lines.length], ['budget', 'Budget & commitments', positions.length]]} />
      {tab === 'plan' && (
        <>
          <div className="sx-toolbar">
            {plan.status === 'DRAFT' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.submitPlan()}>
                Submit plan for approval
              </button>
            )}
            {plan.status === 'SUBMITTED' && (
              <>
                <input className="form-control" style={{ maxWidth: 260 }} placeholder="Comment (required to return)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Plan comment" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.decidePlan(true, note)}>
                  Approve plan
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.decidePlan(false, note)}>
                  Return
                </button>
              </>
            )}
            <span className="sx-grow" />
            <ExportCsvButton name={`procurement-plan-${plan.year}`} header={['Category', 'SKU', 'Description', 'Department', 'Quarter', 'Method', 'Qty', 'Planned', 'Ordered', 'Variance', 'Requisitions']} rows={() => pa.map((r) => [r.line.category, r.line.sku ?? '', r.line.description, r.line.department, `Q${r.line.quarter}`, r.line.method, r.line.qty, r.line.estValue, r.actual, r.variance, r.reqs])} />
          </div>
          {pa.length ? (
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>When · how</th>
                  <th className="r">Planned</th>
                  <th className="r">Ordered</th>
                  <th style={{ width: 140 }}>Used</th>
                  <th className="r">Requisitions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pa.map((r) => (
                  <tr key={r.line.id}>
                    <td>
                      <div className="sx-cell-main">
                        <span>{r.line.description}</span>
                        <small>
                          {r.line.category}
                          {r.line.sku ? ` · ${r.line.sku}` : ''} · {r.line.department} · {r.line.qty.toLocaleString()} units
                        </small>
                      </div>
                    </td>
                    <td>
                      Q{r.line.quarter} · {r.line.method}
                    </td>
                    <td className="r">{kes(r.line.estValue)}</td>
                    <td className="r">{kes(r.actual)}</td>
                    <td>
                      <Meter value={Math.min(1, r.used)} tone={r.used > 1 ? 'red' : r.used > 0.8 ? 'gold' : 'green'} />
                    </td>
                    <td className="r">{r.reqs}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r.line)}>
                        Edit
                      </button>
                      {plan.status === 'DRAFT' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.removePlanLine(r.line.id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty icon={<CalendarRange size={20} />} title="No plan lines yet" />
          )}
          <h3>Plan history</h3>
          <Timeline items={plan.history} />
        </>
      )}
      {tab === 'budget' && (
        <>
          <p className="sx-muted">Available = annual budget − posted actuals − open commitments (approved orders not yet billed, and requisitions in approval). Requisitions that would overspend are routed to the Finance Director.</p>
          <table className="sx-table">
            <thead>
              <tr>
                <th>Budget line</th>
                <th className="r">Budget</th>
                <th className="r">Actual</th>
                <th className="r">Committed</th>
                <th className="r">Available</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.account}>
                  <td>
                    {p.account} · {p.name}
                  </td>
                  <td className="r">{kes(p.budget)}</td>
                  <td className="r">{kes(p.actual)}</td>
                  <td className="r">{kes(p.committed)}</td>
                  <td className="r">{p.available < 0 ? <Pill status="OVERDUE" label={kes(p.available)} /> : kes(p.available)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrill(p.account)}>
                      Commitments ({p.commits.length})
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {drilled && (
        <Drawer title={`Commitments on ${drilled.account} · ${drilled.name}`} subtitle={`${kes(drilled.committed)} committed · ${kes(drilled.available)} available`} onClose={() => setDrill(null)}>
          <table className="sx-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>What</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {drilled.commits.map((c, i) => (
                <tr
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const doc = c.kind === 'PO' ? com.state.purchaseOrders.find((o) => o.number === c.ref) : com.state.requisitions.find((r) => r.number === c.ref);
                    if (doc) ext.goCore(c.kind === 'PO' ? 'orders' : 'requisitions', doc.id);
                  }}
                >
                  <td className="sx-mono">
                    {c.kind === 'PO' ? 'Order' : 'Requisition'} {c.ref}
                  </td>
                  <td>{c.what}</td>
                  <td className="r">{kes(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Drawer>
      )}
      {edit && (
        <Modal
          size="md"
          title={edit.id ? 'Edit plan line' : 'Add plan line'}
          onClose={() => setEdit(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.savePlanLine(edit).ok && setEdit(null)}>
              Save
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Description" required span={2}>
              <input className="form-control" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className="form-control" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Item (optional)">
              <select className="form-control" value={edit.sku ?? ''} onChange={(e) => setEdit({ ...edit, sku: e.target.value || undefined })}>
                <option value="">Any in category</option>
                {com.state.products
                  .filter((p) => p.category === edit.category)
                  .map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Department">
              <select className="form-control" value={edit.department} onChange={(e) => setEdit({ ...edit, department: e.target.value })}>
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Quarter">
              <select className="form-control" value={edit.quarter} onChange={(e) => setEdit({ ...edit, quarter: Number(e.target.value) as PlanLine['quarter'] })}>
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Method">
              <select className="form-control" value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value as PlanLine['method'] })}>
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input className="form-control" type="number" min="0" value={edit.qty} onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) })} />
            </Field>
            <Field label="Estimated value (KES)" required>
              <input className="form-control" type="number" min="0" value={edit.estValue} onChange={(e) => setEdit({ ...edit, estValue: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};
