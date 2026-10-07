import React, { useState } from 'react';
import { LayoutDashboard, Factory, Layers, FlaskConical, Plus, Play, CheckCircle2, XCircle, Ban, AlertTriangle, PackageCheck, Gauge, Send } from 'lucide-react';
import { useOperations, type ProductionPage } from './store';
import { BATCH_LABEL, batchCost, batchYield, materialNeed, shortages } from './engine';
import { addDays, fmtDate, kes, round2, TODAY } from '../finance/engine';
import type { Batch, QualityCheck, Recipe } from './types';
import { ApprovalPanel, Bars, Chips, DataTable, DefList, Drawer, Field, FlowSteps, Hero, LinkButton, Modal, Panel, Pill, Stat, SuitePage, TodoList, greeting, type Column, type FlowAction, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, OpsFooter, useFocus, useTopOnChange } from './parts';

const LABEL: Record<ProductionPage, string> = { overview: 'Overview', batches: 'Batches', recipes: 'Recipes', quality: 'Quality' };
const B_PILL: Record<Batch['status'], string> = { PLANNED: 'DRAFT', RELEASED: 'APPROVED', IN_PROGRESS: 'OPEN', QC: 'SUBMITTED', COMPLETED: 'POSTED', REJECTED: 'REJECTED', CANCELLED: 'VOID' };

const POverview: React.FC = () => {
  const { state, actor, products, setProduction: go, pname } = useOperations();
  const done = state.batches.filter((b) => b.status === 'COMPLETED');
  const month = done.filter((b) => b.date.slice(0, 7) === TODAY.slice(0, 7));
  const avgYield = done.length ? done.reduce((s, b) => s + batchYield(b), 0) / done.length : 0;
  const qcDone = state.batches.filter((b) => b.checks.length);
  const passRate = qcDone.length ? qcDone.filter((b) => b.status === 'COMPLETED').length / qcDone.length : 0;
  const upcoming = state.batches.filter((b) => ['PLANNED', 'RELEASED'].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
  const recipe = (b: Batch) => state.recipes.find((r) => r.id === b.recipeId)!;
  const todo: TodoItem[] = [
    ...state.batches.filter((b) => b.status === 'QC').map((b) => ({ id: b.id, tone: 'warning' as const, icon: <FlaskConical size={15} />, title: `Quality check ${b.number}`, detail: `${b.plannedQty} × ${recipe(b).name}`, onClick: () => go('batches', b.id) })),
    ...upcoming
      .filter((b) => b.status === 'PLANNED')
      .map((b) => ({ id: b.id, tone: 'info' as const, icon: <Send size={15} />, title: `Release ${b.number}`, detail: `${recipe(b).name} · ${fmtDate(b.date)}`, onClick: () => go('batches', b.id) })),
    ...upcoming
      .filter((b) => b.status === 'RELEASED' && b.date <= addDays(TODAY, 1))
      .map((b) => ({ id: `s${b.id}`, tone: 'info' as const, icon: <Play size={15} />, title: `Start ${b.number}`, detail: `Issue materials for ${recipe(b).name}`, onClick: () => go('batches', b.id) })),
    ...upcoming.flatMap((b) =>
      shortages(recipe(b), b.plannedQty, products).map((s) => ({ id: `x${b.id}${s.sku}`, tone: 'critical' as const, icon: <AlertTriangle size={15} />, title: `Short of ${pname(s.sku)}`, detail: `${b.number} needs ${s.qty}, ${s.have} in stock`, onClick: () => go('batches', b.id) }))
    )
  ];
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const end = addDays(TODAY, -7 * (5 - i));
    const list = done.filter((b) => b.date > addDays(end, -7) && b.date <= end);
    return { label: `${new Date(end + 'T00:00:00').getDate()}/${new Date(end + 'T00:00:00').getMonth() + 1}`, values: [list.reduce((s, b) => s + b.output, 0)] };
  });
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Blending & production"
        text={`${state.batches.filter((b) => b.status === 'IN_PROGRESS').length} batch running · ${upcoming.length} planned · ${todo.length} things need attention`}
        actions={[
          { label: 'Plan a batch', icon: <Plus size={16} />, onClick: () => go('batches', 'new') },
          { label: 'Recipes', icon: <Layers size={16} />, onClick: () => go('recipes') },
          { label: 'Quality', icon: <FlaskConical size={16} />, onClick: () => go('quality') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Output this month" value={month.reduce((s, b) => s + b.output, 0).toLocaleString()} detail={`${month.length} batches completed`} icon={<PackageCheck size={17} />} onClick={() => go('batches')} />
        <Stat label="Average yield" value={`${(avgYield * 100).toFixed(1)}%`} detail="Good output against plan" icon={<Gauge size={17} />} tone="blue" />
        <Stat label="QC pass rate" value={`${Math.round(passRate * 100)}%`} detail={`${qcDone.length} batches checked`} icon={<FlaskConical size={17} />} tone="violet" onClick={() => go('quality')} />
        <Stat label="Planned" value={upcoming.length} detail={upcoming.length ? `Next: ${fmtDate(upcoming[0].date)}` : 'Nothing planned'} icon={<Factory size={17} />} tone="gold" onClick={() => go('batches')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Quality checks, releases and material shortages">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Units produced" subtitle="Good output per week" action={<LinkButton onClick={() => go('batches')}>Batches</LinkButton>}>
          <Bars data={weeks} series={[{ name: 'Units', color: '#237857' }]} height={200} />
        </Panel>
      </div>
      <Panel title="Production schedule" subtitle="Planned and released batches" flush>
        <BatchTable rows={upcoming} onOpen={(id) => go('batches', id)} />
      </Panel>
    </div>
  );
};

const BatchTable: React.FC<{ rows: Batch[]; onOpen: (id: string) => void; selected?: string | null }> = ({ rows, onOpen, selected }) => {
  const { state, products } = useOperations();
  const recipe = (b: Batch) => state.recipes.find((r) => r.id === b.recipeId)!;
  const columns: Column<Batch>[] = [
    { key: 'n', header: 'Batch', render: (b) => <b className="sx-mono">{b.number}</b>, sort: (b) => b.number, width: 130 },
    {
      key: 'p',
      header: 'Product',
      render: (b) => (
        <div className="sx-cell-main">
          <span>{recipe(b).name}</span>
          <small>
            {b.line}
            {b.forOrder && ` · for ${b.forOrder}`}
          </small>
        </div>
      ),
      sort: (b) => recipe(b).name
    },
    { key: 'd', header: 'Date', render: (b) => fmtDate(b.date), sort: (b) => b.date },
    { key: 'q', header: 'Planned', render: (b) => b.plannedQty, align: 'right' },
    {
      key: 'o',
      header: 'Output',
      render: (b) => (b.status === 'COMPLETED' ? `${b.output} (${(batchYield(b) * 100).toFixed(1)}%)` : <span className="sx-muted">—</span>),
      align: 'right',
      hideOnMobile: true
    },
    {
      key: 's',
      header: 'Status',
      render: (b) => {
        const short = ['PLANNED', 'RELEASED'].includes(b.status) && shortages(recipe(b), b.plannedQty, products).length;
        return short ? <Pill status="OVERDUE" label="Material short" /> : <Pill status={B_PILL[b.status]} label={BATCH_LABEL[b.status]} />;
      },
      sort: (b) => b.status
    }
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(b) => b.id} onRowClick={(b) => onOpen(b.id)} selected={selected} initialSort={{ key: 'd', dir: 'desc' }} />;
};

const BatchesPage: React.FC = () => {
  const { state, production } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'COMPLETED' | 'REJECTED'>('ALL');
  useFocus(production.focus, (id) => state.batches.some((b) => b.id === id), setOpenId, () => setPlanning(true));
  const rows = state.batches.filter(
    (b) => filter === 'ALL' || (filter === 'OPEN' && ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC'].includes(b.status)) || b.status === filter
  );
  const open = state.batches.find((b) => b.id === openId);
  return (
    <SuitePage
      eyebrow="Production"
      title="Batches"
      subtitle="Plan, release, issue materials, run, check quality and put finished goods into stock."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPlanning(true)}>
          <Plus size={15} /> Plan a batch
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: state.batches.length },
            { value: 'OPEN', label: 'In progress', count: state.batches.filter((b) => ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC'].includes(b.status)).length },
            { value: 'COMPLETED', label: 'Completed', count: state.batches.filter((b) => b.status === 'COMPLETED').length },
            { value: 'REJECTED', label: 'Rejected', count: state.batches.filter((b) => b.status === 'REJECTED').length }
          ]}
        />
      </div>
      <BatchTable rows={rows} onOpen={setOpenId} selected={openId} />
      {open && <BatchDrawer b={open} onClose={() => setOpenId(null)} />}
      {planning && (
        <PlanModal
          onClose={() => setPlanning(false)}
          onSaved={(id) => {
            setPlanning(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const BatchDrawer: React.FC<{ b: Batch; onClose: () => void }> = ({ b, onClose }) => {
  const { state, actor, products, pname, releaseBatch, startBatch, sendToQc, cancelBatch } = useOperations();
  const [qc, setQc] = useState(false);
  const r = state.recipes.find((x) => x.id === b.recipeId)!;
  const need = materialNeed(r, b.plannedQty);
  const short = shortages(r, b.plannedQty, products);
  const at = { PLANNED: 0, RELEASED: 1, IN_PROGRESS: 2, QC: 3, COMPLETED: 5, REJECTED: 3, CANCELLED: 0 }[b.status];
  const actions: FlowAction[] = [];
  if (b.status === 'PLANNED') actions.push({ label: 'Release to the floor', icon: <Send size={14} />, onClick: () => releaseBatch(b.id), title: actor.role !== 'MANAGER' ? 'The Operations Manager releases batches' : undefined });
  if (b.status === 'RELEASED') actions.push({ label: 'Issue materials and start', icon: <Play size={14} />, onClick: () => startBatch(b.id), disabled: short.length > 0 });
  if (b.status === 'IN_PROGRESS') actions.push({ label: 'Finish run — send to QC', icon: <FlaskConical size={14} />, onClick: () => sendToQc(b.id) });
  if (b.status === 'QC') actions.push({ label: 'Record quality results', icon: <FlaskConical size={14} />, onClick: () => setQc(true), title: actor.role !== 'QC' ? 'The Quality Controller records results' : undefined });
  if (['PLANNED', 'RELEASED'].includes(b.status)) actions.push({ label: 'Cancel', icon: <Ban size={14} />, onClick: () => cancelBatch(b.id), tone: 'ghost' });
  const cost = batchCost(b, products);
  return (
    <>
      <Drawer wide title={b.number} subtitle={`${r.name} · ${b.line}`} badge={<Pill status={B_PILL[b.status]} label={BATCH_LABEL[b.status]} />} onClose={onClose}>
        <div className="sx-amount-hero">
          <div>
            <span>{b.status === 'COMPLETED' ? 'Good output' : 'Planned quantity'}</span>
            <strong>{(b.status === 'COMPLETED' ? b.output : b.plannedQty).toLocaleString()}</strong>
          </div>
          <div>
            <span>{b.status === 'COMPLETED' ? 'Yield' : 'Production date'}</span>
            <b>{b.status === 'COMPLETED' ? `${(batchYield(b) * 100).toFixed(1)}%` : fmtDate(b.date)}</b>
          </div>
        </div>
        {short.length > 0 && (
          <div className="sx-callout danger">
            <AlertTriangle size={16} />
            <div>
              <b>Not enough materials</b>
              {short.map((s) => (
                <span key={s.sku}>
                  • {pname(s.sku)}: need {s.qty}, have {s.have}
                </span>
              ))}
            </div>
          </div>
        )}
        <DefList
          items={[
            ['Recipe batch size', `${r.batchSize}`],
            ['Line time', `${round2((r.hours * b.plannedQty) / r.batchSize)} h`],
            ['For order', b.forOrder ?? 'Stock'],
            ...(cost ? ([['Material cost', kes(cost)], ['Cost per unit', b.output ? kes(round2(cost / b.output)) : '—']] as [string, string][]) : [])
          ]}
        />
        <h4 className="sx-subhead">Materials</h4>
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Material</th>
              <th style={{ textAlign: 'right' }}>Needed</th>
              <th style={{ textAlign: 'right' }}>{b.issued.length ? 'Issued' : 'In stock'}</th>
            </tr>
          </thead>
          <tbody>
            {need.map((n) => {
              const p = products.find((x) => x.sku === n.sku);
              const issued = b.issued.find((i) => i.sku === n.sku)?.qty;
              return (
                <tr key={n.sku}>
                  <td>{pname(n.sku)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {n.qty} {p?.unit}
                  </td>
                  <td style={{ textAlign: 'right' }} className={issued === undefined && (p?.stock ?? 0) < n.qty ? 'sx-danger-text' : 'sx-muted'}>
                    {issued ?? p?.stock}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {b.checks.length > 0 && (
          <>
            <h4 className="sx-subhead">Quality results · {b.checkedBy}</h4>
            <table className="sx-mini-table">
              <tbody>
                {b.checks.map((c) => (
                  <tr key={c.parameter}>
                    <td>{c.parameter}</td>
                    <td>{c.result}</td>
                    <td style={{ textAlign: 'right' }}>{c.pass ? <Pill status="POSTED" label="Pass" /> : <Pill status="REJECTED" label="Fail" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {b.rejectedQty > 0 && b.status === 'COMPLETED' && <p className="sx-note">{b.rejectedQty} units rejected at inspection.</p>}
          </>
        )}
        <h4 className="sx-subhead">Progress</h4>
        <ApprovalPanel
          steps={<FlowSteps steps={['Planned', 'Released', 'Running', 'Quality', 'In stock']} at={at} off={b.status === 'CANCELLED' || b.status === 'REJECTED'} />}
          actions={actions}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}).
            </>
          }
          history={b.history}
        />
      </Drawer>
      {qc && <QcModal b={b} r={r} onClose={() => setQc(false)} />}
    </>
  );
};

const QcModal: React.FC<{ b: Batch; r: Recipe; onClose: () => void }> = ({ b, r, onClose }) => {
  const { recordQc } = useOperations();
  const [checks, setChecks] = useState<QualityCheck[]>(r.checks.map((c) => ({ parameter: c, target: c, result: '', pass: true })));
  const [rejected, setRejected] = useState(0);
  const set = (i: number, patch: Partial<QualityCheck>) => setChecks(checks.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const fail = checks.some((c) => !c.pass);
  return (
    <Modal
      size="lg"
      title={`Quality check — ${b.number}`}
      subtitle={`${b.plannedQty} × ${r.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">{fail ? <b className="sx-danger-text">Batch will be quarantined</b> : <>Good output <b>{b.plannedQty - rejected}</b></>}</span>
          <span className="sx-grow" />
          <button type="button" className={`btn btn-sm ${fail ? 'btn-danger' : 'btn-primary'}`} onClick={() => recordQc(b.id, checks, rejected).ok && onClose()}>
            {fail ? <XCircle size={14} /> : <CheckCircle2 size={14} />} {fail ? 'Fail the batch' : 'Pass and put into stock'}
          </button>
        </>
      }
    >
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Check</th>
            <th>Result</th>
            <th style={{ width: 110 }}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={c.parameter}>
              <td>{c.parameter}</td>
              <td>
                <input className="form-control" value={c.result} onChange={(e) => set(i, { result: e.target.value })} placeholder="Measured value" />
              </td>
              <td>
                <select className="form-control" value={c.pass ? 'pass' : 'fail'} onChange={(e) => set(i, { pass: e.target.value === 'pass' })}>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!fail && (
        <Field label="Units rejected at inspection" hint="Damaged or under-weight packs removed from the good output">
          <input className="form-control" type="number" min="0" value={rejected || ''} onChange={(e) => setRejected(Number(e.target.value))} />
        </Field>
      )}
    </Modal>
  );
};

const PlanModal: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { state, products, planBatch, pname, commercial } = useOperations();
  const [recipeId, setRecipeId] = useState(state.recipes[0].id);
  const r = state.recipes.find((x) => x.id === recipeId)!;
  const [qty, setQty] = useState(r.batchSize);
  const [date, setDate] = useState(addDays(TODAY, 2));
  const [order, setOrder] = useState('');
  const short = shortages(r, qty, products);
  const openOrders = commercial.state.orders.filter((o) => o.status === 'APPROVED' && !o.closed && o.lines.some((l) => l.sku === r.product && l.delivered < l.qty));
  return (
    <Modal
      size="lg"
      title="Plan a production batch"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const res = planBatch(recipeId, qty, date, order || undefined);
              if (res.ok && res.id) onSaved(res.id);
            }}
          >
            Plan batch
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Product" span={2}>
          <select
            className="form-control"
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              setQty(state.recipes.find((x) => x.id === e.target.value)!.batchSize);
            }}
          >
            {state.recipes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity" hint={`Standard batch ${r.batchSize}`}>
          <input className="form-control" type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Production date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="For a customer order (optional)" span={4}>
          <select className="form-control" value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="">Make for stock</option>
            {openOrders.map((o) => (
              <option key={o.id} value={o.number}>
                {o.number} · {commercial.party(o.customerId)?.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <h4 className="sx-subhead">Material check</h4>
      <table className="sx-mini-table">
        <tbody>
          {materialNeed(r, qty).map((n) => {
            const have = products.find((p) => p.sku === n.sku)?.stock ?? 0;
            return (
              <tr key={n.sku}>
                <td>{pname(n.sku)}</td>
                <td style={{ textAlign: 'right' }}>{n.qty}</td>
                <td style={{ textAlign: 'right' }} className={have < n.qty ? 'sx-danger-text' : 'sx-success-text'}>
                  {have} in stock
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {short.length > 0 && <p className="sx-note sx-danger-text">Plan it now and raise a requisition in Procurement — it cannot start until materials arrive.</p>}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const RecipesPage: React.FC = () => {
  const { state, products, pname, setProduction } = useOperations();
  return (
    <SuitePage eyebrow="Production" title="Recipes" subtitle="What goes into each product, how long it takes, and how many batches today's stock can make.">
      <div className="sx-row">
        {state.recipes.map((r) => {
          const possible = Math.floor(Math.min(...r.materials.map((m) => (products.find((p) => p.sku === m.sku)?.stock ?? 0) / m.qty)));
          const unitCost = round2(r.materials.reduce((s, m) => s + m.qty * (products.find((p) => p.sku === m.sku)?.cost ?? 0), 0) / r.batchSize);
          const product = products.find((p) => p.sku === r.product);
          return (
            <Panel
              key={r.id}
              title={r.name}
              subtitle={`${r.line} · batch of ${r.batchSize} · ${r.hours} h`}
              action={
                <LinkButton onClick={() => setProduction('batches', 'new')}>Plan</LinkButton>
              }
            >
              <table className="sx-mini-table">
                <tbody>
                  {r.materials.map((m) => (
                    <tr key={m.sku}>
                      <td>{pname(m.sku)}</td>
                      <td style={{ textAlign: 'right' }}>{m.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="sx-facts">
                <li>
                  <span>Material cost per unit</span>
                  <b>{kes(unitCost)}</b>
                </li>
                <li>
                  <span>Selling price · margin</span>
                  <b>{product ? `${kes(product.price)} · ${Math.round(((product.price - unitCost) / product.price) * 100)}%` : '—'}</b>
                </li>
                <li>
                  <span>Batches possible from stock</span>
                  <b className={possible < 1 ? 'sx-danger-text' : ''}>{possible}</b>
                </li>
              </ul>
            </Panel>
          );
        })}
      </div>
    </SuitePage>
  );
};

const QualityPage: React.FC = () => {
  const { state, setProduction } = useOperations();
  const checked = state.batches.filter((b) => b.checks.length);
  const fails = checked.flatMap((b) => b.checks.filter((c) => !c.pass).map((c) => ({ b, c })));
  const rejectedUnits = checked.reduce((s, b) => s + b.rejectedQty, 0);
  const totalUnits = checked.reduce((s, b) => s + b.plannedQty, 0);
  return (
    <SuitePage eyebrow="Production" title="Quality" subtitle="Every batch is checked before it reaches stock. Failures are quarantined, not sold.">
      <div className="sx-stats">
        <Stat label="Batches checked" value={checked.length} icon={<FlaskConical size={17} />} />
        <Stat label="Pass rate" value={`${checked.length ? Math.round((checked.filter((b) => b.status === 'COMPLETED').length / checked.length) * 100) : 0}%`} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Units rejected" value={rejectedUnits} detail={`${totalUnits ? ((rejectedUnits / totalUnits) * 100).toFixed(1) : 0}% of inspected units`} icon={<XCircle size={17} />} tone="gold" />
        <Stat label="Waiting for QC" value={state.batches.filter((b) => b.status === 'QC').length} icon={<AlertTriangle size={17} />} tone="red" onClick={() => setProduction('batches')} />
      </div>
      <Panel title="Results by batch" flush>
        <BatchTable rows={[...checked, ...state.batches.filter((b) => b.status === 'QC')]} onOpen={(id) => setProduction('batches', id)} />
      </Panel>
      {fails.length > 0 && (
        <Panel title="Failed checks">
          <ul className="sx-list">
            {fails.map(({ b, c }) => (
              <li key={b.id + c.parameter}>
                <span className="sx-mono">{b.number}</span>
                <span>{c.parameter}</span>
                <span className="sx-muted">{c.result}</span>
                <b className="sx-danger-text">Fail</b>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </SuitePage>
  );
};

export const ProductionSidebar: React.FC = () => {
  const { state, production, setProduction } = useOperations();
  const groups: SuiteNavGroup<ProductionPage>[] = [
    { label: 'Production', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Make',
      items: [
        { id: 'batches', label: 'Batches', icon: Factory, badge: state.batches.filter((b) => b.status === 'PLANNED').length, badgeTone: 'neutral' },
        { id: 'recipes', label: 'Recipes', icon: Layers },
        { id: 'quality', label: 'Quality', icon: FlaskConical, badge: state.batches.filter((b) => b.status === 'QC').length }
      ]
    }
  ];
  return <SuiteSidebar name="Blending & Production" tagline="Plan · make · check" icon={Factory} groups={groups} active={production.page} onSelect={(p) => setProduction(p)} footer={<OpsFooter />} />;
};
export const ProductionCrumb: React.FC = () => {
  const { production, setProduction } = useOperations();
  return <Crumb name="Blending & Production" page={production.page} label={LABEL[production.page]} onHome={() => setProduction('overview')} />;
};
export const ProductionSuite: React.FC = () => {
  const { production } = useOperations();
  useTopOnChange(production.page);
  return (
    <div className="sx-suite" key={production.page}>
      {production.page === 'overview' && <POverview />}
      {production.page === 'batches' && <BatchesPage />}
      {production.page === 'recipes' && <RecipesPage />}
      {production.page === 'quality' && <QualityPage />}
    </div>
  );
};

