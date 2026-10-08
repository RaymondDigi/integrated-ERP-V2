import React, { useState } from 'react';
import { BarChart3, Gauge, Activity, Receipt, Zap, Sun, AlertTriangle } from 'lucide-react';
import { ExportCsvButton } from '../../../platform/Widgets';
import { useOperations } from '../store';
import { WO_LABEL, woCost } from '../engine';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import type { Batch } from '../types';
import { Bars, DataTable, Field, Meter, Panel, Stat, SuitePage } from '../../ui/kit';
import { useMaintenanceExt } from './store';
import { costCentreOf, energyReport, maintenanceKpis, type KpiFilter } from './engine';
import { COST_CENTRES } from './data';
import type { EnergyReading } from './types';

const BarList: React.FC<{ items: { label: string; value: number }[]; format?: (n: number) => string }> = ({ items, format = (n) => kes(n, { compact: true }) }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.length ? (
    <ul className="sx-barlist">
      {items.map((i) => (
        <li key={i.label}>
          <div>
            <span>{i.label}</span>
            <b>{format(i.value)}</b>
          </div>
          <Meter value={i.value / max} />
        </li>
      ))}
    </ul>
  ) : (
    <p className="sx-muted">Nothing in this period.</p>
  );
};

export const ReportsPage: React.FC = () => {
  const { state, products } = useOperations();
  const [f, setF] = useState<KpiFilter>({ from: addDays(TODAY, -90), to: TODAY, equipmentId: '', costCentre: '', kind: '' });
  const k = maintenanceKpis(state, products, f);
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? id;
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Reports & KPIs"
      subtitle="Cost by type, machine and cost centre; reliability (MTBF, MTTR), preventive compliance and backlog — filtered by period, equipment, cost centre and job type."
      actions={
        <ExportCsvButton
          name={`maintenance-${f.from}-${f.to}`}
          header={['Work order', 'Date', 'Equipment', 'Type', 'Cost centre', 'Status', 'Downtime h', 'Cost KES']}
          rows={() => k.rows.map((w) => [w.number, w.date, eqName(w.equipmentId), w.kind, costCentreOf(state, w), WO_LABEL[w.status], w.downtimeHours, w.status === 'COMPLETED' || w.status === 'REVIEW' ? woCost(w, products) : ''])}
        />
      }
    >
      <div className="sx-grid sx-filters">
        <Field label="From">
          <input className="form-control" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </Field>
        <Field label="To">
          <input className="form-control" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </Field>
        <Field label="Equipment">
          <select className="form-control" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
            <option value="">All</option>
            {state.equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cost centre">
          <select className="form-control" value={f.costCentre} onChange={(e) => setF({ ...f, costCentre: e.target.value })}>
            <option value="">All</option>
            {COST_CENTRES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Job type">
          <select className="form-control" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="">All</option>
            {['BREAKDOWN', 'PREVENTIVE', 'INSPECTION', 'IMPROVEMENT', 'CALIBRATION', 'REFURBISH'].map((x) => (
              <option key={x} value={x}>
                {x.charAt(0) + x.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sx-stats">
        <Stat label="Maintenance cost" value={kes(k.total, { compact: true })} detail={`${k.rows.length} work orders`} icon={<Receipt size={17} />} tone="blue" />
        <Stat label="MTBF" value={k.mtbfDays !== null ? `${k.mtbfDays} days` : '—'} detail={`${k.breakdowns} breakdowns`} icon={<Activity size={17} />} />
        <Stat label="MTTR" value={k.mttrHours !== null ? `${k.mttrHours} h` : '—'} detail={`${k.downtime} h downtime`} icon={<Gauge size={17} />} tone="gold" />
        <Stat label="Preventive on time" value={k.pmCompliance !== null ? `${k.pmCompliance}%` : '—'} detail={`Backlog ${k.backlog}`} icon={<BarChart3 size={17} />} tone="violet" />
      </div>
      <div className="sx-row">
        <Panel title="Cost by job type">
          <BarList items={k.byType} />
        </Panel>
        <Panel title="Cost by cost centre">
          <BarList items={k.byCostCentre} />
        </Panel>
      </div>
      <div className="sx-row">
        <Panel title="Cost by machine">
          <BarList items={k.byEquipment.slice(0, 8)} />
        </Panel>
        <Panel title="Backlog ageing" subtitle="Open work orders by age">
          <BarList items={k.ageing} format={(n) => `${n}`} />
        </Panel>
      </div>
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Energy                                                              */
/* ------------------------------------------------------------------ */

export const EnergyPage: React.FC = () => {
  const { state, products } = useOperations();
  const mx = useMaintenanceExt();
  const [from, setFrom] = useState(addDays(TODAY, -30));
  const [to, setTo] = useState(TODAY);
  const [f, setF] = useState({ date: TODAY, source: 'GRID' as EnergyReading['source'], kWh: '' });
  // kg of tea packed: materials issued to the batch that are measured in kg
  const kgOf = (b: Batch) => b.issued.reduce((x, i) => x + (products.find((p) => p.sku === i.sku)?.unit === 'kg' ? i.qty : 0), 0);
  const r = energyReport(mx.state.energy, state.batches, from, to, kgOf);
  const prev = energyReport(mx.state.energy, state.batches, addDays(from, -30), addDays(from, -1), kgOf);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(TODAY, -i * 7);
    const start = addDays(end, -6);
    const w = energyReport(mx.state.energy, state.batches, start, end, kgOf);
    return { label: fmtDate(start).slice(0, 6), values: w.sources.map((s) => s.kWh) };
  }).reverse();
  return (
    <SuitePage eyebrow="Maintenance" title="Energy" subtitle="Daily grid, generator and solar consumption with cost, and energy used per kg of tea packed.">
      <div className="sx-grid sx-filters">
        <Field label="From">
          <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="sx-stats">
        <Stat label="Consumption" value={`${r.kWh.toLocaleString()} kWh`} detail={prev.kWh ? `${r.kWh >= prev.kWh ? '+' : ''}${Math.round(((r.kWh - prev.kWh) / prev.kWh) * 100)}% on previous 30 days` : undefined} icon={<Zap size={17} />} />
        <Stat label="Energy cost" value={kes(r.cost, { compact: true })} icon={<Receipt size={17} />} tone="blue" />
        <Stat label="kWh per kg packed" value={r.perKg ?? '—'} detail={r.costPerKg ? `${kes(r.costPerKg)} per kg` : `${r.kg.toLocaleString()} kg packed`} icon={<Gauge size={17} />} tone="gold" />
        <Stat label="Solar share" value={`${r.solarShare}%`} icon={<Sun size={17} />} tone="green" />
      </div>
      {r.sources[1].kWh > 0 && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            <b>{r.sources[1].kWh.toLocaleString()} kWh from the generator</b>
            <span>{kes(r.sources[1].cost)} — power cuts cost more than twice the grid rate per kWh.</span>
          </div>
        </div>
      )}
      <Panel title="Weekly consumption by source (kWh)">
        <Bars data={weeks} series={[{ name: 'Grid', color: '#2563eb' }, { name: 'Generator', color: '#dc2626' }, { name: 'Solar', color: '#16a34a' }]} />
      </Panel>
      <Panel title="Record a reading">
        <div className="sx-inline-form sx-wrap">
          <input className="form-control" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
          <select className="form-control" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as EnergyReading['source'] })} aria-label="Source">
            <option value="GRID">Grid (KPLC)</option>
            <option value="GENERATOR">Generator</option>
            <option value="SOLAR">Solar</option>
          </select>
          <input className="form-control" type="number" min="0" value={f.kWh} onChange={(e) => setF({ ...f, kWh: e.target.value })} placeholder="kWh" aria-label="kWh" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.recordEnergy(f.date, f.source, Number(f.kWh)).ok && setF({ ...f, kWh: '' })}>
            Record
          </button>
        </div>
      </Panel>
      <DataTable
        rows={mx.state.energy.filter((e) => e.date >= from && e.date <= to)}
        rowKey={(e) => e.id}
        initialSort={{ key: 'd', dir: 'desc' }}
        columns={[
          { key: 'd', header: 'Date', render: (e) => fmtDate(e.date), sort: (e) => e.date },
          { key: 's', header: 'Source', render: (e) => e.source.charAt(0) + e.source.slice(1).toLowerCase() },
          { key: 'k', header: 'kWh', render: (e) => e.kWh.toLocaleString(), align: 'right', sort: (e) => e.kWh },
          { key: 'c', header: 'Cost', render: (e) => kes(e.cost), align: 'right', sort: (e) => e.cost }
        ]}
      />
    </SuitePage>
  );
};
