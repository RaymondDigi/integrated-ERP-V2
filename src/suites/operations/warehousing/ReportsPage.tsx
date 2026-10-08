import React, { useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Play, Printer, Send } from 'lucide-react';
import { esc, ExportCsvButton, printDocument } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { daysBetween, fmtDate, round2, TODAY } from '../../finance/engine';
import { Chips, DataTable, Field, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { ageingBucket, AGEING_BUCKETS, locationUsedKg, locLabel, lotKgAsOf, METRIC_LABEL, metricValue, MOVE_LABEL, OWNERSHIP_LABEL, QC_LABEL, scheduleDue, weightVariance } from './engine';
import { useWarehouseExt } from './store';
import type { ReportSchedule, TeaLot } from './types';
import { num, ReadOnlyNote } from './ui';

type Cell = string | number;
interface Report {
  header: string[];
  rows: Cell[][];
  /** Columns that hold numbers (right-aligned, totalled) */
  totals?: number[];
}

export const REPORTS = [
  { id: 'stock', label: 'Tea stock as at a date' },
  { id: 'products', label: 'Product stock as at a date' },
  { id: 'ageing', label: 'Stock ageing' },
  { id: 'variance', label: 'Weight variance (declared vs weighed)' },
  { id: 'stuffing', label: 'Stuffing status' },
  { id: 'arrivals', label: 'Tea arrival advice' },
  { id: 'dispatch', label: 'Dispatch notes' },
  { id: 'space', label: 'Space occupation' }
] as const;
type ReportId = (typeof REPORTS)[number]['id'];

const GROUPS = { grade: 'Grade', owner: 'Owner', season: 'Season / year', warehouse: 'Warehouse', month: 'Arrival month', ownership: 'Ownership', garden: 'Garden' } as const;
type GroupBy = keyof typeof GROUPS;

export const WhReportsPage: React.FC = () => {
  const wh = useWarehouseExt();
  const { state, whName, partyName, ops } = wh;
  const [tab, setTab] = useState<'reports' | 'schedules'>('reports');
  const [report, setReport] = useState<ReportId>('stock');
  const [asOf, setAsOf] = useState(TODAY);
  const [groupBy, setGroupBy] = useState<GroupBy>('grade');
  const [warehouse, setWarehouse] = useState('ALL');
  const loc = (id?: string) => state.locations.find((l) => l.id === id);
  const inWh = (w: string) => warehouse === 'ALL' || w === warehouse;
  const groupKey = (l: TeaLot) =>
    groupBy === 'grade' ? l.grade : groupBy === 'owner' ? partyName(l.owner) : groupBy === 'season' ? l.season : groupBy === 'warehouse' ? whName(l.warehouseId) : groupBy === 'month' ? l.arrival.slice(0, 7) : groupBy === 'ownership' ? OWNERSHIP_LABEL[l.ownership] : l.garden;

  const data: Report = useMemo(() => {
    if (report === 'stock') {
      const kg = lotKgAsOf(state, asOf);
      const rows = state.lots.filter((l) => inWh(l.warehouseId) && kg[l.id] > 0).map((l) => [l.lotNo, l.garden, l.grade, partyName(l.owner), whName(l.warehouseId), locLabel(loc(l.locationId)), QC_LABEL[l.qc], kg[l.id], round2(kg[l.id] * l.costPerKg)]);
      return { header: ['Lot', 'Garden', 'Grade', 'Owner', 'Warehouse', 'Location', 'QC', 'Net kg', 'Value KES'], rows, totals: [7, 8] };
    }
    if (report === 'products') {
      const later = (d: string) => d > asOf;
      const com = ops.commercial.state;
      const rows = ops.products
        .filter((p) => p.kind !== 'SERVICE')
        .map((p) => {
          let qty = p.stock;
          for (const m of ops.state.moves) if (m.sku === p.sku && later(m.date) && m.kind !== 'TRANSFER') qty -= m.qty;
          for (const d of com.deliveries)
            if (later(d.date))
              for (const l of d.lines) if (com.orders.find((o) => o.id === d.orderId)?.lines.find((x) => x.id === l.lineId)?.sku === p.sku) qty += l.qty;
          for (const g of com.receipts)
            if (later(g.date))
              for (const l of g.lines) if (com.purchaseOrders.find((o) => o.id === g.poId)?.lines.find((x) => x.id === l.lineId)?.sku === p.sku) qty -= l.qty;
          return [p.sku, p.name, p.unit, round2(qty), round2(qty * p.cost)];
        });
      return { header: ['SKU', 'Item', 'Unit', 'Qty', 'Value at cost KES'], rows, totals: [3, 4] };
    }
    if (report === 'ageing') {
      const lots = state.lots.filter((l) => l.status === 'IN_STOCK' && inWh(l.warehouseId));
      const groups = [...new Set(lots.map(groupKey))].sort();
      const rows = groups.map((g) => {
        const of = lots.filter((l) => groupKey(l) === g);
        const by = AGEING_BUCKETS.map((b) => round2(of.filter((l) => ageingBucket(daysBetween(l.arrival, TODAY)) === b).reduce((x, l) => x + l.netKg, 0)));
        return [g, ...by, round2(by.reduce((x, v) => x + v, 0))];
      });
      return { header: [GROUPS[groupBy], ...AGEING_BUCKETS.map((b) => `${b} (kg)`), 'Total kg'], rows, totals: [1, 2, 3, 4, 5, 6] };
    }
    if (report === 'variance') {
      const rows = state.lots
        .filter((l) => inWh(l.warehouseId) && weightVariance(l) !== null)
        .map((l) => {
          const v = weightVariance(l) ?? 0;
          return [l.lotNo, l.invoiceNo, l.garden, l.declaredKg, l.weighedKg ?? 0, v, l.declaredKg ? `${round2((v / l.declaredKg) * 100)}%` : '—'];
        });
      return { header: ['Lot', 'Invoice', 'Garden', 'Declared kg', 'Weighed kg', 'Variance kg', 'Variance %'], rows, totals: [3, 4, 5] };
    }
    if (report === 'stuffing') {
      const rows = state.loadingPlans
        .filter((p) => inWh(p.warehouseId))
        .map((p) => [p.number, p.ref, whName(p.warehouseId), p.container || '—', p.lines.reduce((x, l) => x + l.bags, 0), round2(p.lines.reduce((x, l) => x + l.kg, 0)), p.vgm ? `${num(p.vgm.grossKg)} kg (${p.vgm.method === 'METHOD_1' ? 'M1' : 'M2'})` : 'Not certified', p.status === 'STUFFED' ? `Stuffed ${fmtDate(p.stuffedAt ?? '')}` : 'Planned']);
      return { header: ['Plan', 'Shipment / SI', 'Stuffing base', 'Container', 'Bags', 'Cargo kg', 'VGM', 'Status'], rows, totals: [4, 5] };
    }
    if (report === 'arrivals') {
      const rows = state.asns
        .filter((a) => a.status === 'RECEIVED' && inWh(a.warehouseId))
        .flatMap((a) =>
          a.lines.map((l) => {
            const t = a.tally?.lines.find((x) => x.invoiceNo === l.invoiceNo);
            return [a.tally?.number ?? a.number, fmtDate(a.arrivedAt ?? a.expected), partyName(a.owner), l.garden, l.grade, l.invoiceNo, l.bags, t?.bagsCounted ?? 0, round2(l.bags * l.kgPerBag), t?.weighedKg ?? 0];
          })
        );
      return { header: ['Tally', 'Arrived', 'Owner', 'Garden', 'Grade', 'Invoice', 'Bags advised', 'Bags counted', 'Kg declared', 'Kg weighed'], rows, totals: [6, 7, 8, 9] };
    }
    if (report === 'dispatch') {
      const rows = state.lotMoves
        .filter((m) => (m.kind === 'LOAD' || m.kind === 'DELIVERY' || m.kind === 'RELEASE') && m.date <= asOf)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m) => {
          const l = state.lots.find((x) => x.id === m.lotId);
          return [fmtDate(m.date), m.ref, MOVE_LABEL[m.kind], l?.lotNo ?? m.lotId, l?.grade ?? '', partyName(l?.owner ?? 'OWN'), Math.abs(m.bags), Math.abs(m.kg), m.by];
        });
      return { header: ['Date', 'Reference', 'Movement', 'Lot', 'Grade', 'Owner', 'Bags', 'Kg', 'By'], rows, totals: [6, 7] };
    }
    const rows = state.locations
      .filter((l) => inWh(l.warehouseId))
      .map((l) => {
        const used = locationUsedKg(state, l.id);
        return [whName(l.warehouseId), locLabel(l), l.zone, l.capacityKg, used, round2(l.capacityKg - used), `${Math.round((used / l.capacityKg) * 100)}%`];
      });
    return { header: ['Warehouse', 'Location', 'Zone', 'Capacity kg', 'Used kg', 'Free kg', 'Occupied'], rows, totals: [3, 4, 5] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, asOf, groupBy, warehouse, state, ops.state, ops.products]);

  const totalRow = data.totals?.length ? data.header.map((_, i) => (i === 0 ? 'Total' : data.totals?.includes(i) ? round2(data.rows.reduce((x, r) => x + (Number(r[i]) || 0), 0)) : '')) : null;
  const title = REPORTS.find((r) => r.id === report)?.label ?? '';
  type Row = { id: number; cells: Cell[] };
  const rows: Row[] = data.rows.map((cells, id) => ({ id, cells }));
  const cols: Column<Row>[] = data.header.map((h, i) => ({
    key: String(i),
    header: h,
    render: (r) => (typeof r.cells[i] === 'number' ? (r.cells[i] as number).toLocaleString() : r.cells[i]),
    sort: (r) => r.cells[i],
    align: data.totals?.includes(i) ? ('right' as const) : undefined
  }));
  const print = () =>
    printDocument(
      title,
      `<h1>${esc(title)}</h1><p>${esc(report === 'stock' || report === 'products' || report === 'dispatch' ? `As at ${fmtDate(asOf)}` : `Run ${fmtDate(TODAY)}`)} · ${esc(warehouse === 'ALL' ? 'All warehouses' : whName(warehouse))}</p><table><thead><tr>${data.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${[...data.rows, ...(totalRow ? [totalRow] : [])].map((r) => `<tr>${r.map((c) => `<td>${esc(typeof c === 'number' ? c.toLocaleString() : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    );

  return (
    <SuitePage eyebrow="Warehousing" title="Warehouse reports" subtitle="Stock as at any date, ageing by grade, owner or season, weight variances, stuffing, arrival advice, dispatch notes and space — export, print or schedule them.">
      <ReadOnlyNote />
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'reports', label: 'Reports' },
          { value: 'schedules', label: `Schedules & alerts (${state.schedules.length})` }
        ]}
      />
      {tab === 'reports' ? (
        <>
          <div className="sx-toolbar">
            <select className="form-control" value={report} onChange={(e) => setReport(e.target.value as ReportId)} aria-label="Report">
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {(report === 'stock' || report === 'products' || report === 'dispatch') && <input className="form-control" type="date" value={asOf} max={TODAY} onChange={(e) => setAsOf(e.target.value || TODAY)} aria-label="As at date" />}
            {report === 'ageing' && (
              <select className="form-control" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Group by">
                {Object.entries(GROUPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    Group by {v.toLowerCase()}
                  </option>
                ))}
              </select>
            )}
            {report !== 'products' && (
              <select className="form-control" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} aria-label="Warehouse">
                <option value="ALL">All warehouses</option>
                {ops.state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
            <ExportCsvButton name={`report-${report}-${asOf}`} header={data.header} rows={() => [...data.rows, ...(totalRow ? [totalRow] : [])]} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={print}>
              <Printer size={14} /> Print
            </button>
          </div>
          <Panel title={title} subtitle={`${data.rows.length} rows${totalRow ? ` · totals: ${data.totals?.map((i) => `${data.header[i]} ${Number(totalRow[i]).toLocaleString()}`).join(' · ')}` : ''}`}>
            <DataTable rows={rows} columns={cols} rowKey={(r) => String(r.id)} pageSize={20} empty="Nothing to report for this selection" />
          </Panel>
        </>
      ) : (
        <SchedulesTab />
      )}
    </SuitePage>
  );
};

const SchedulesTab: React.FC = () => {
  const { state, saveSchedule, runSchedules } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [editing, setEditing] = useState<Partial<ReportSchedule> | null>(null);
  const due = state.schedules.filter((r) => scheduleDue(state, r));
  const cols: Column<ReportSchedule>[] = [
    { key: 'r', header: 'Report', render: (r) => <b>{r.report}</b> },
    { key: 'f', header: 'When', render: (r) => (r.frequency === 'CONDITION' && r.condition ? `When ${METRIC_LABEL[r.condition.metric].toLowerCase()} ${r.condition.op} ${r.condition.value} (now ${metricValue(state, r.condition.metric)})` : r.frequency.toLowerCase()) },
    { key: 'to', header: 'Recipients', render: (r) => r.recipients },
    { key: 'l', header: 'Last sent', render: (r) => (r.lastRun ? fmtDate(r.lastRun.slice(0, 10)) : 'Never') },
    { key: 's', header: 'Status', render: (r) => (!r.active ? <Pill status="VOID" label="paused" /> : scheduleDue(state, r) ? <Pill status="OVERDUE" label="due now" /> : <Pill status="ACTIVE" label="active" />) },
    {
      key: 'a',
      header: '',
      render: (r) =>
        readOnly ? null : (
          <span className="sx-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => (e.stopPropagation(), runSchedules(r.id))}>
              <Send size={13} /> Send now
            </button>
          </span>
        )
    }
  ];
  return (
    <>
      <div className="sx-stats">
        <Stat label="Schedules" value={state.schedules.length} icon={<CalendarClock size={17} />} />
        <Stat label="Due now" value={due.length} detail={due.map((d) => d.report).join(', ') || 'Nothing due'} icon={<BarChart3 size={17} />} tone={due.length ? 'gold' : 'green'} />
      </div>
      {!readOnly && (
        <div className="sx-toolbar">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ report: REPORTS[0].label, frequency: 'WEEKLY', recipients: '', active: true })}>
            New schedule
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => runSchedules()}>
            <Play size={13} /> Run due schedules
          </button>
        </div>
      )}
      <DataTable rows={state.schedules} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => !readOnly && setEditing(r)} empty="No schedules" />
      {editing && (
        <Modal
          size="md"
          title={editing.id ? 'Edit schedule' : 'New schedule'}
          onClose={() => setEditing(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveSchedule(editing as ReportSchedule).ok && setEditing(null)}>
              Save schedule
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Report" span={2}>
              <select className="form-control" value={editing.report} onChange={(e) => setEditing({ ...editing, report: e.target.value })}>
                {REPORTS.map((r) => (
                  <option key={r.id}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Frequency">
              <select className="form-control" value={editing.frequency} onChange={(e) => setEditing({ ...editing, frequency: e.target.value as ReportSchedule['frequency'], condition: e.target.value === 'CONDITION' ? (editing.condition ?? { metric: 'HOLD_KG', op: '>', value: 0 }) : undefined })}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="CONDITION">When a condition is met</option>
              </select>
            </Field>
            <Field label="Recipients" required>
              <input className="form-control" value={editing.recipients} onChange={(e) => setEditing({ ...editing, recipients: e.target.value })} placeholder="e.g. Operations, Finance" />
            </Field>
            {editing.frequency === 'CONDITION' && editing.condition && (
              <>
                <Field label="Metric">
                  <select className="form-control" value={editing.condition.metric} onChange={(e) => setEditing({ ...editing, condition: { ...editing.condition!, metric: e.target.value as NonNullable<ReportSchedule['condition']>['metric'] } })}>
                    {Object.entries(METRIC_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Condition">
                  <div className="sx-inline-form">
                    <select className="form-control" value={editing.condition.op} onChange={(e) => setEditing({ ...editing, condition: { ...editing.condition!, op: e.target.value as '>' | '<' } })}>
                      <option value=">">above</option>
                      <option value="<">below</option>
                    </select>
                    <input className="form-control" type="number" value={editing.condition.value} onChange={(e) => setEditing({ ...editing, condition: { ...editing.condition!, value: Number(e.target.value) } })} />
                  </div>
                </Field>
              </>
            )}
            <Field label="Active">
              <select className="form-control" value={editing.active ? 'Y' : 'N'} onChange={(e) => setEditing({ ...editing, active: e.target.value === 'Y' })}>
                <option value="Y">Active</option>
                <option value="N">Paused</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
};
