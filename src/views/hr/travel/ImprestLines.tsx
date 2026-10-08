import React from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { ImprestLineDraft } from '../../../context/travelState';
import { EXPENSE_CATEGORIES, lineAmount, type ImprestLine } from '../../../data/travelEngine';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

export const blankImprestLine = (costCentre = ''): ImprestLineDraft => ({ description: '', category: EXPENSE_CATEGORIES[0], costCentre, quantity: 1, unitCost: 0 });

export const draftTotal = (lines: ImprestLineDraft[]) => lines.reduce((n, l) => n + lineAmount(l), 0);

/** Several items in one petty cash or imprest request: description, category, cost centre, quantity × unit cost. */
export const ImprestLinesEditor: React.FC<{
  lines: ImprestLineDraft[];
  onChange: (lines: ImprestLineDraft[]) => void;
  costCentres: string[];
  defaultCostCentre: string;
  /** Petty cash limit on the total, if any */
  limit?: number;
}> = ({ lines, onChange, costCentres, defaultCostCentre, limit }) => {
  const set = (k: number, p: Partial<ImprestLineDraft>) => onChange(lines.map((l, j) => (j === k ? { ...l, ...p } : l)));
  const total = draftTotal(lines);
  const over = limit !== undefined && total > limit;
  return (
    <div className="trv-imp-lines">
      <div className="hi-scroll">
        <table className="hr-table trv-lines">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Item / description</th>
              <th>Category</th>
              <th>Cost centre</th>
              <th className="hi-num" style={{ width: 70 }}>
                Qty
              </th>
              <th className="hi-num" style={{ width: 110 }}>
                Unit cost
              </th>
              <th className="hi-num" style={{ width: 110 }}>
                Amount
              </th>
              <th style={{ width: 76 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, k) => (
              <tr key={k}>
                <td className="hi-sub">{k + 1}</td>
                <td>
                  <input className="form-control" value={l.description} placeholder="e.g. A4 paper, 5 reams" aria-label={`Line ${k + 1} description`} onChange={(ev) => set(k, { description: ev.target.value })} />
                </td>
                <td>
                  <select className="form-control" value={l.category} aria-label={`Line ${k + 1} category`} onChange={(ev) => set(k, { category: ev.target.value })}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className="form-control" value={l.costCentre || defaultCostCentre} aria-label={`Line ${k + 1} cost centre`} onChange={(ev) => set(k, { costCentre: ev.target.value })}>
                    {[...new Set([defaultCostCentre, ...costCentres].filter(Boolean))].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="form-control trv-num-input" type="number" min={1} value={l.quantity || ''} aria-label={`Line ${k + 1} quantity`} onChange={(ev) => set(k, { quantity: Number(ev.target.value) || 0 })} />
                </td>
                <td>
                  <input className="form-control trv-num-input" type="number" min={0} value={l.unitCost || ''} aria-label={`Line ${k + 1} unit cost`} onChange={(ev) => set(k, { unitCost: Number(ev.target.value) || 0 })} />
                </td>
                <td className="hi-num">
                  <strong>{lineAmount(l).toLocaleString()}</strong>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-secondary btn-sm" title="Duplicate line" aria-label={`Duplicate line ${k + 1}`} onClick={() => onChange([...lines.slice(0, k + 1), { ...l }, ...lines.slice(k + 1)])}>
                      <Copy size={12} />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" title="Remove line" aria-label={`Remove line ${k + 1}`} disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== k))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{ textAlign: 'right' }}>
                <strong>
                  Total · {lines.filter((l) => lineAmount(l) > 0).length} line{lines.filter((l) => lineAmount(l) > 0).length === 1 ? '' : 's'}
                </strong>
              </td>
              <td className="hi-num">
                <strong style={{ color: over ? 'var(--status-critical, #b91c1c)' : undefined }}>{total.toLocaleString()}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...lines, blankImprestLine(lines[lines.length - 1]?.costCentre || defaultCostCentre)])}>
          <Plus size={13} /> Add line
        </button>
        {limit !== undefined && (
          <span className="hi-sub" style={{ color: over ? 'var(--status-critical, #b91c1c)' : undefined }}>
            {over ? `Over the petty cash limit by ${kes(total - limit)} — split it or raise an imprest` : `${kes(Math.max(0, limit - total))} left of the ${kes(limit)} petty cash limit`}
          </span>
        )}
      </div>
    </div>
  );
};

/** Lines of a submitted request; while pending, the approver can allow less on any line. */
export const ImprestLinesTable: React.FC<{ lines: ImprestLine[]; allowed?: number[]; onAllowed?: (v: number[]) => void }> = ({ lines, allowed, onAllowed }) => {
  const editing = !!onAllowed && !!allowed;
  const decided = lines.some((l) => l.approved !== undefined);
  const asked = lines.reduce((n, l) => n + l.amount, 0);
  const ok = editing ? allowed!.reduce((n, a) => n + a, 0) : lines.reduce((n, l) => n + (l.approved ?? l.amount), 0);
  return (
    <div className="hi-scroll">
      <table className="hr-table trv-lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Category</th>
            <th>Cost centre</th>
            <th className="hi-num">Qty × unit</th>
            <th className="hi-num">Asked</th>
            {(editing || decided) && <th className="hi-num">Approved</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, k) => (
            <tr key={k}>
              <td className="hi-sub">{k + 1}</td>
              <td>{l.description}</td>
              <td className="hi-sub">{l.category}</td>
              <td className="hi-sub">{l.costCentre}</td>
              <td className="hi-num hi-sub">
                {l.quantity} × {l.unitCost.toLocaleString()}
              </td>
              <td className="hi-num">{l.amount.toLocaleString()}</td>
              {editing ? (
                <td className="hi-num">
                  <input
                    className="form-control trv-num-input"
                    type="number"
                    min={0}
                    max={l.amount}
                    value={allowed![k]}
                    aria-label={`Approve line ${k + 1}`}
                    onChange={(ev) => onAllowed!(allowed!.map((a, j) => (j === k ? Math.max(0, Math.min(l.amount, Number(ev.target.value) || 0)) : a)))}
                  />
                </td>
              ) : decided ? (
                <td className="hi-num" style={{ color: (l.approved ?? l.amount) < l.amount ? 'var(--status-warning, #b45309)' : undefined }}>
                  {(l.approved ?? l.amount).toLocaleString()}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ textAlign: 'right' }}>
              <strong>Total</strong>
            </td>
            <td className="hi-num">
              <strong>{asked.toLocaleString()}</strong>
            </td>
            {(editing || decided) && (
              <td className="hi-num">
                <strong>{ok.toLocaleString()}</strong>
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
