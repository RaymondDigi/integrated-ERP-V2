import React, { useState } from 'react';
import { Gauge, Printer, Target, Timer } from 'lucide-react';
import { esc, ExportCsvButton, printDocument } from '../../../platform/Widgets';
import { fmtDate, round2, TODAY, addDays } from '../../finance/engine';
import { DataTable, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { shipValue } from '../engine';
import { SI_KPIS, SI_LABEL, siBags, siKg, siKpi } from './engine';
import { useShippingExt } from './store';
import type { ShippingInstruction } from './types';

type Cell = string | number;
const REPORTS = [
  { id: 'booking', label: 'Booking confirmations' },
  { id: 'register', label: 'Shipment register' },
  { id: 'contracted', label: 'Contracted vs shipped teas' },
  { id: 'stuffing', label: 'Stuffing by warehouse' }
] as const;
type ReportId = (typeof REPORTS)[number]['id'];

export const ShippingReportsPage: React.FC = () => {
  const { state, ops, wh, party } = useShippingExt();
  const [report, setReport] = useState<ReportId>('register');
  const [from, setFrom] = useState(addDays(TODAY, -180));
  const [to, setTo] = useState(addDays(TODAY, 60));
  const inRange = (d: string) => d >= from && d <= to;
  const shipments = ops.state.shipments.filter((s) => inRange(s.etd));
  const data: { header: string[]; rows: Cell[][] } = (() => {
    if (report === 'booking')
      return {
        header: ['Shipment', 'Customer', 'Shipping line', 'Booking ref', 'Vessel', 'ETD', 'Container', 'Seal', 'SI'],
        rows: shipments.map((s) => [s.number, party(s.customerId)?.name ?? '', s.line, s.bookingRef, s.vessel, s.etd, s.container ?? '', s.seal ?? '', s.siNumber ?? ''])
      };
    if (report === 'register')
      return {
        header: ['Shipment', 'Customer', 'Destination', 'Incoterm', 'Vessel', 'ETD', 'ETA', 'Stage', 'Invoice', 'VGM kg', 'Value KES'],
        rows: shipments.map((s) => [s.number, party(s.customerId)?.name ?? '', s.destination, s.incoterm, s.vessel, s.etd, s.eta, s.stage, s.invoiceNumber ?? '', s.vgm?.grossKg ?? '', round2(shipValue(s))])
      };
    if (report === 'contracted') {
      const list = state.instructions.filter((si) => si.status !== 'CANCELLED' && inRange(si.readyBy));
      return {
        header: ['Contract', 'SI', 'Customer', 'Status', 'Bags contracted', 'Kg contracted', 'Kg shipped', 'Kg outstanding'],
        rows: list.map((si) => {
          const shipped = si.status === 'SHIPPED' ? siKg(si) : 0;
          return [si.contractRef, si.number, party(si.customerId)?.name ?? '', SI_LABEL[si.status], siBags(si), siKg(si), shipped, round2(siKg(si) - shipped)];
        })
      };
    }
    const plans = wh.state.loadingPlans.filter((p) => inRange((p.stuffedAt ?? TODAY).slice(0, 10)));
    const whs = [...new Set(plans.map((p) => p.warehouseId))];
    return {
      header: ['Stuffing warehouse', 'Plans', 'Stuffed', 'Containers', 'Bags', 'Kg stuffed'],
      rows: whs.map((w) => {
        const mine = plans.filter((p) => p.warehouseId === w);
        const stuffed = mine.filter((p) => p.status === 'STUFFED');
        return [wh.whName(w), mine.length, stuffed.length, stuffed.map((p) => p.container).join(', '), stuffed.reduce((x, p) => x + p.lines.reduce((y, l) => y + l.bags, 0), 0), round2(stuffed.reduce((x, p) => x + p.lines.reduce((y, l) => y + l.kg, 0), 0))];
      })
    };
  })();
  type Row = { id: number; c: Cell[] };
  const rows: Row[] = data.rows.map((c, id) => ({ id, c }));
  const cols: Column<Row>[] = data.header.map((h, i) => ({ key: String(i), header: h, render: (r) => (typeof r.c[i] === 'number' ? (r.c[i] as number).toLocaleString() : r.c[i]), sort: (r) => r.c[i] }));
  const title = REPORTS.find((r) => r.id === report)!.label;
  return (
    <SuitePage eyebrow="Shipping" title="Shipping reports" subtitle="Booking confirmations, the shipment register, contracted vs shipped teas and stuffing per warehouse, for any date range — export or print.">
      <div className="sx-toolbar">
        <select className="form-control" value={report} onChange={(e) => setReport(e.target.value as ReportId)} aria-label="Report">
          {REPORTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <ExportCsvButton name={`shipping-${report}`} header={data.header} rows={() => data.rows} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(title, `<h1>${esc(title)}</h1><p>${fmtDate(from)} – ${fmtDate(to)}</p><table><thead><tr>${data.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)}>
          <Printer size={14} /> Print
        </button>
      </div>
      <Panel title={title} subtitle={`${data.rows.length} rows · ${fmtDate(from)} – ${fmtDate(to)}`}>
        <DataTable rows={rows} columns={cols} rowKey={(r) => String(r.id)} pageSize={20} empty="Nothing in this date range" />
      </Panel>
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */

export const KpisPage: React.FC = () => {
  const { state, party } = useShippingExt();
  const list = state.instructions.filter((si) => si.submittedAt && si.status !== 'CANCELLED');
  const perf = SI_KPIS.map((k) => {
    const vals = list.map((si) => siKpi(si).find((x) => x.key === k.key)!).filter((x) => x.done && x.days !== null);
    const avg = vals.length ? round2(vals.reduce((x, v) => x + (v.days ?? 0), 0) / vals.length) : null;
    const met = vals.filter((v) => v.met).length;
    return { ...k, avg, n: vals.length, met };
  });
  const cols: Column<ShippingInstruction>[] = [
    { key: 'n', header: 'SI', render: (si) => <div className="sx-cell-main"><b className="sx-mono">{si.number}</b><small>{party(si.customerId)?.name}</small></div> },
    ...SI_KPIS.map((k) => ({
      key: k.key,
      header: `${k.label} (≤${k.target}d)`,
      render: (si: ShippingInstruction) => {
        const x = siKpi(si).find((y) => y.key === k.key)!;
        if (x.days === null) return <span className="sx-muted">—</span>;
        return <span className={x.met ? 'sx-success-text' : 'sx-danger-text'}>{x.days} d{x.done ? '' : ' so far'}</span>;
      },
      align: 'right' as const
    })),
    { key: 's', header: 'Status', render: (si) => <Pill status={si.status === 'SHIPPED' ? 'POSTED' : 'OPEN'} label={SI_LABEL[si.status]} /> }
  ];
  return (
    <SuitePage eyebrow="Shipping" title="SI processing KPIs" subtitle="Target days for each stage of an instruction against what actually happened, from the timestamps on every SI.">
      <div className="sx-stats">
        {perf.map((p, i) => (
          <Stat key={p.key} label={p.label} value={p.avg === null ? '—' : `${p.avg} d`} detail={`Target ${p.target} d · met ${p.met}/${p.n}`} icon={i === 3 ? <Gauge size={17} /> : i === 0 ? <Target size={17} /> : <Timer size={17} />} tone={p.avg === null ? undefined : p.avg <= p.target ? 'green' : 'red'} />
        ))}
      </div>
      <DataTable rows={list} columns={cols} rowKey={(si) => si.id} empty="No submitted instructions yet" />
    </SuitePage>
  );
};
