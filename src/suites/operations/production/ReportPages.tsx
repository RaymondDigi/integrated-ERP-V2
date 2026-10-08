import React, { useMemo, useState } from 'react';
import { Factory, Scale, ShieldAlert, Users } from 'lucide-react';
import { fmtDate, round2 } from '../../finance/engine';
import { useApp } from '../../../context/AppContext';
import { useOperations } from '../store';
import { Chips, DataTable, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useNotices } from '../../../platform/outbox';
import { useBlending } from './store';
import { useLiveSchedule } from './hooks';
import { BLEND_LABEL, BLEND_PILL, batchVariance, blendBalance, exposureLog, outturn, wipValue } from './engine';

type Tab = 'outturn' | 'variance' | 'wip' | 'labour' | 'exposure' | 'gl' | 'schedule' | 'detail' | 'moves' | 'notices';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const table = (header: string[], rows: (string | number)[][]) =>
  `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

/** Production reports: out-turn, variances, WIP, labour, hazard exposure, manufacturing GL, schedules, moves and notices. */
export const ReportsPage: React.FC = () => {
  const { state: ops, products, finance, pname } = useOperations();
  const { state: s } = useBlending();
  const { setCurrentView } = useApp();
  const { sched, wcs } = useLiveSchedule();
  const notices = useNotices();
  const [tab, setTab] = useState<Tab>('outturn');

  const outRows = useMemo(
    () => s.blendsheets.filter((b) => b.outturn || b.status === 'IN_PROGRESS').map((b) => ({ b, o: outturn(b), bal: blendBalance(s, ops, b) })),
    [s, ops]
  );
  const varRows = useMemo(() => ops.batches.filter((b) => b.status === 'COMPLETED' || b.status === 'QC').map((b) => ({ b, v: batchVariance(s, ops, b, products) })), [s, ops, products]);
  const wip = useMemo(() => wipValue(s, ops, products), [s, ops, products]);
  const labour = useMemo(
    () => [
      ...Object.values(s.ext).flatMap((e) => e.labour.map((l) => ({ ...l, ref: ops.batches.find((b) => b.id === e.batchId)?.number ?? e.batchId, kind: 'Batch' }))),
      ...s.blendsheets.flatMap((b) => b.labour.map((l) => ({ ...l, ref: b.number, kind: 'Blend' })))
    ].map((l) => {
      const wc = s.workCenters.find((w) => w.id === l.workCenterId);
      return { ...l, wc: wc?.name ?? l.workCenterId, cost: round2(l.hours * (wc ? wc.labourDirectRate + wc.labourIndirectRate : 0)) };
    }),
    [s, ops]
  );
  const exposure = useMemo(() => exposureLog(s, ops), [s, ops]);
  const glIds = useMemo(() => new Set([...Object.values(s.ext).flatMap((e) => e.journalIds), ...s.blendsheets.flatMap((b) => b.journalIds)]), [s]);
  const journals = finance.state.journals.filter((j) => glIds.has(j.id));
  const glLines = journals.flatMap((j) => j.lines.map((l) => ({ j, l })));
  const glByAccount = useMemo(() => {
    const m = new Map<string, { debit: number; credit: number }>();
    for (const { l } of glLines) {
      const r = m.get(l.account) ?? { debit: 0, credit: 0 };
      r.debit += l.debit;
      r.credit += l.credit;
      m.set(l.account, r);
    }
    return [...m.entries()].map(([account, r]) => ({ account, debit: round2(r.debit), credit: round2(r.credit), net: round2(r.debit - r.credit) }));
  }, [glLines]);
  const prodNotices = notices.filter((n) => n.module === 'Production');
  const stdCode = (id: string) => s.standards.find((x) => x.id === id)?.code ?? id;
  const wcName = (id: string) => wcs.find((w) => w.id === id)?.name ?? id;
  const summary = sched.map((j) => ({ j, first: j.sops[0], last: j.sops[j.sops.length - 1] }));
  const detail = sched.flatMap((j) => j.sops.map((o, i) => ({ id: `${j.id}-${i}`, j, o })));

  const totalVar = round2(varRows.reduce((a, r) => a + r.v.total, 0));
  const overExposed = exposure.filter((e) => e.over).length;

  return (
    <SuitePage eyebrow="Production" title="Production reports" subtitle="Out-turn, cost variances, work in process, labour, exposure, manufacturing ledger and schedules — all calculated from the live records.">
      <div className="sx-stats">
        <Stat label="Work in process" value={kes(wip.total)} tone="blue" icon={<Factory size={17} />} />
        <Stat label="Net cost variance" value={kes(totalVar)} tone={totalVar > 0 ? 'red' : 'green'} icon={<Scale size={17} />} />
        <Stat label="Labour hours booked" value={round2(labour.reduce((a, l) => a + l.hours, 0)).toLocaleString()} tone="violet" icon={<Users size={17} />} />
        <Stat label="Over exposure limit" value={String(overExposed)} tone={overExposed ? 'red' : 'green'} icon={<ShieldAlert size={17} />} />
      </div>
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'outturn', label: 'Blend out-turn', count: outRows.length },
          { value: 'variance', label: 'Variances', count: varRows.length },
          { value: 'wip', label: 'Work in process', count: wip.rows.length },
          { value: 'labour', label: 'Labour', count: labour.length },
          { value: 'exposure', label: 'Hazard exposure', count: exposure.length },
          { value: 'gl', label: 'Manufacturing GL', count: journals.length },
          { value: 'schedule', label: 'Schedule summary', count: summary.length },
          { value: 'detail', label: 'Detailed schedule', count: detail.length },
          { value: 'moves', label: 'Production moves', count: s.moves.length },
          { value: 'notices', label: 'Notifications', count: prodNotices.length }
        ]}
      />

      {tab === 'outturn' && (
        <Panel
          title="Blend out-turn"
          subtitle="Tea issued against blended tea made, by-products (dust, fibre, sweepings) and unexplained loss, per blendsheet."
          action={
            <ExportCsvButton
              name="blend-outturn"
              header={['Blendsheet', 'Blend', 'Status', 'Input kg', 'Output kg', 'By-products kg', 'Loss kg', 'Out-turn %', 'Issued to packing kg', 'Balance kg']}
              rows={() => outRows.map(({ b, o, bal }) => [b.number, stdCode(b.standardId), BLEND_LABEL[b.status], o.input, o.output, o.by, o.loss, round2(o.pct * 100), bal.issued, bal.balance])}
            />
          }
        >
          <DataTable
            rows={outRows}
            rowKey={(r) => r.b.id}
            columns={[
              { key: 'n', header: 'Blendsheet', render: (r) => r.b.number, sort: (r) => r.b.number },
              { key: 'c', header: 'Blend', render: (r) => stdCode(r.b.standardId) },
              { key: 's', header: 'Status', render: (r) => <Pill status={BLEND_PILL[r.b.status]} label={BLEND_LABEL[r.b.status]} /> },
              { key: 'i', header: 'Input kg', align: 'right', render: (r) => r.o.input.toLocaleString() },
              { key: 'o', header: 'Output kg', align: 'right', render: (r) => r.o.output.toLocaleString() },
              { key: 'b', header: 'By-products', align: 'right', render: (r) => r.o.by.toLocaleString() },
              { key: 'l', header: 'Loss', align: 'right', render: (r) => `${r.o.loss.toLocaleString()} (${pct(r.o.lossPct)})` },
              { key: 'p', header: 'Out-turn', align: 'right', render: (r) => (r.b.outturn ? pct(r.o.pct) : 'In progress'), sort: (r) => r.o.pct },
              { key: 'bal', header: 'Left for packing kg', align: 'right', render: (r) => r.bal.balance.toLocaleString() }
            ]}
            empty="No blend has been issued yet."
          />
        </Panel>
      )}

      {tab === 'variance' && (
        <Panel
          title="Standard against actual"
          subtitle="Material usage, labour efficiency, overhead, subcontract, rework and yield variances per batch. Positive is adverse."
          action={
            <ExportCsvButton
              name="production-variances"
              header={['Batch', 'Product', 'Standard', 'Actual', 'Total', 'Material', 'Labour', 'Overhead', 'Subcontract', 'Rework', 'Yield', 'Std hours', 'Actual hours']}
              rows={() => varRows.map(({ b, v }) => [b.number, pname(ops.recipes.find((r) => r.id === b.recipeId)?.product ?? ''), v.standard, v.actual, v.total, v.material, v.labour, v.overhead, v.subcontract, v.rework, v.yieldVar, v.stdHours, v.actHours])}
            />
          }
        >
          <DataTable
            rows={varRows}
            rowKey={(r) => r.b.id}
            columns={[
              { key: 'n', header: 'Batch', render: (r) => r.b.number, sort: (r) => r.b.number },
              { key: 's', header: 'Standard', align: 'right', render: (r) => kes(r.v.standard) },
              { key: 'a', header: 'Actual', align: 'right', render: (r) => kes(r.v.actual) },
              { key: 't', header: 'Variance', align: 'right', render: (r) => <strong style={{ color: r.v.total > 0 ? 'var(--danger, #b42318)' : undefined }}>{kes(r.v.total)}</strong>, sort: (r) => r.v.total },
              { key: 'm', header: 'Material', align: 'right', render: (r) => kes(r.v.material) },
              { key: 'l', header: 'Labour', align: 'right', render: (r) => kes(r.v.labour) },
              { key: 'o', header: 'Overhead', align: 'right', render: (r) => kes(r.v.overhead) },
              { key: 'y', header: 'Yield', align: 'right', render: (r) => `${kes(r.v.yieldVar)} (${pct(r.v.yieldPct)})` },
              { key: 'h', header: 'Hours std / act', align: 'right', render: (r) => `${r.v.stdHours} / ${r.v.actHours}` }
            ]}
            empty="No batch has reached QC yet."
          />
        </Panel>
      )}

      {tab === 'wip' && (
        <Panel
          title="Work in process"
          subtitle="Material issued plus labour and overhead booked on open batches and blends."
          action={<ExportCsvButton name="wip" header={['Reference', 'Kind', 'Status', 'Material', 'Conversion']} rows={() => wip.rows.map((r) => [r.ref, r.kind, r.status, r.material, r.conversion])} />}
        >
          <DataTable
            rows={wip.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'r', header: 'Reference', render: (r) => r.ref },
              { key: 'k', header: 'Kind', render: (r) => (r.kind === 'BATCH' ? 'Packing batch' : 'Blend') },
              { key: 's', header: 'Status', render: (r) => r.status },
              { key: 'm', header: 'Material', align: 'right', render: (r) => kes(r.material) },
              { key: 'c', header: 'Labour & overhead', align: 'right', render: (r) => kes(r.conversion) },
              { key: 't', header: 'Total', align: 'right', render: (r) => kes(r.material + r.conversion) }
            ]}
            footer={<tr><td colSpan={5}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{kes(wip.total)}</strong></td></tr>}
            empty="Nothing is in process."
          />
        </Panel>
      )}

      {tab === 'labour' && (
        <Panel
          title="Labour booked"
          subtitle="Hours each person booked against batches and blends, costed at the work-centre direct and indirect rates."
          action={<ExportCsvButton name="production-labour" header={['Date', 'Employee', 'Reference', 'Work centre', 'Hours', 'Cost', 'Booked by']} rows={() => labour.map((l) => [l.date, l.employee, l.ref, l.wc, l.hours, l.cost, l.by])} />}
        >
          <DataTable
            rows={labour}
            rowKey={(l) => l.id}
            initialSort={{ key: 'd', dir: 'desc' }}
            columns={[
              { key: 'd', header: 'Date', render: (l) => fmtDate(l.date), sort: (l) => l.date },
              { key: 'e', header: 'Employee', render: (l) => l.employee, sort: (l) => l.employee },
              { key: 'r', header: 'Reference', render: (l) => `${l.kind} ${l.ref}` },
              { key: 'w', header: 'Work centre', render: (l) => l.wc },
              { key: 'h', header: 'Hours', align: 'right', render: (l) => l.hours, sort: (l) => l.hours },
              { key: 'c', header: 'Cost', align: 'right', render: (l) => kes(l.cost) }
            ]}
            empty="No labour booked."
          />
        </Panel>
      )}

      {tab === 'exposure' && (
        <Panel
          title="Hazard exposure"
          subtitle="Monthly hours each person spent on work centres with a hazardous agent (tea dust in the blending tower) against the limit. Over-limit bookings also raise a notice to Health & Safety."
          action={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCurrentView('osh-security')}>
                Open Health &amp; Safety
              </button>
              <ExportCsvButton name="hazard-exposure" header={['Month', 'Employee', 'Agents', 'Hours', 'Limit', 'Over']} rows={() => exposure.map((e) => [e.month, e.employee, e.agents.join('; '), e.hours, e.limit, e.over ? 'Yes' : 'No'])} />
            </>
          }
        >
          <DataTable
            rows={exposure}
            rowKey={(e) => `${e.employee}-${e.month}`}
            columns={[
              { key: 'm', header: 'Month', render: (e) => e.month },
              { key: 'e', header: 'Employee', render: (e) => e.employee },
              { key: 'a', header: 'Agent', render: (e) => e.agents.join(', ') },
              { key: 'r', header: 'Jobs', render: (e) => e.refs.join(', ') },
              { key: 'h', header: 'Hours / limit', align: 'right', render: (e) => `${e.hours} / ${e.limit}` },
              { key: 'o', header: 'Status', render: (e) => <Pill status={e.over ? 'REJECTED' : 'APPROVED'} label={e.over ? 'Over limit' : 'Within limit'} /> }
            ]}
            empty="No hours booked on hazardous work centres."
          />
        </Panel>
      )}

      {tab === 'gl' && (
        <>
          <Panel title="Manufacturing ledger by account" subtitle="Every journal that blending and production posted to Finance: issues to WIP, finished goods at standard, variances and write-offs.">
            <DataTable<(typeof glByAccount)[number]>
              rows={glByAccount}
              rowKey={(r) => r.account}
              columns={[
                { key: 'a', header: 'Account', render: (r) => r.account },
                { key: 'd', header: 'Debit', align: 'right', render: (r) => kes(r.debit) },
                { key: 'c', header: 'Credit', align: 'right', render: (r) => kes(r.credit) },
                { key: 'n', header: 'Net', align: 'right', render: (r) => kes(r.net) }
              ]}
              empty="No production journals posted yet."
            />
          </Panel>
          <Panel
            title="Production journals"
            action={<ExportCsvButton name="production-gl" header={['Journal', 'Date', 'Memo', 'Status', 'Account', 'Debit', 'Credit']} rows={() => glLines.map(({ j, l }) => [j.number, j.date, j.memo, j.status, l.account, l.debit, l.credit])} />}
          >
            <DataTable
              rows={journals}
              rowKey={(j) => j.id}
              onRowClick={(j) => {
                finance.setPage('journals', j.id);
                setCurrentView('finance');
              }}
              columns={[
                { key: 'n', header: 'Journal', render: (j) => j.number },
                { key: 'd', header: 'Date', render: (j) => fmtDate(j.date), sort: (j) => j.date },
                { key: 'm', header: 'Memo', render: (j) => j.memo },
                { key: 's', header: 'Status', render: (j) => <Pill status={j.status} /> },
                { key: 'v', header: 'Value', align: 'right', render: (j) => kes(j.lines.reduce((a, l) => a + l.debit, 0)) }
              ]}
              empty="No production journals posted yet."
            />
          </Panel>
        </>
      )}

      {tab === 'schedule' && (
        <Panel
          title="Schedule summary"
          subtitle="One line per job from the live finite schedule."
          action={
            <>
              <ExportCsvButton name="schedule-summary" header={['Job', 'Item', 'Qty', 'Start', 'Finish', 'Due', 'Late days']} rows={() => summary.map(({ j }) => [j.ref, j.label, j.qty, j.start, j.finish, j.due, j.lateDays])} />
              <PrintButton title="Schedule summary" html={() => `<h1>Schedule summary</h1>${table(['Job', 'Item', 'Qty', 'Start', 'Finish', 'Due', 'Late days'], summary.map(({ j }) => [j.ref, j.label, j.qty, j.start, j.finish, j.due, j.lateDays]))}`} />
            </>
          }
        >
          <DataTable
            rows={summary}
            rowKey={(r) => r.j.id}
            columns={
              [
                { key: 'r', header: 'Job', render: (r) => r.j.ref },
                { key: 'i', header: 'Item', render: (r) => r.j.label },
                { key: 'q', header: 'Qty', align: 'right', render: (r) => r.j.qty },
                { key: 's', header: 'Start', render: (r) => fmtDate(r.j.start), sort: (r) => r.j.start },
                { key: 'f', header: 'Finish', render: (r) => fmtDate(r.j.finish), sort: (r) => r.j.finish },
                { key: 'd', header: 'Due', render: (r) => (r.j.due ? fmtDate(r.j.due) : '—') },
                { key: 'l', header: 'Late', align: 'right', render: (r) => (r.j.lateDays > 0 ? <Pill status="REJECTED" label={`${r.j.lateDays} d late`} /> : 'On time'), sort: (r) => r.j.lateDays }
              ] as Column<(typeof summary)[number]>[]
            }
            empty="Nothing scheduled."
          />
        </Panel>
      )}

      {tab === 'detail' && (
        <Panel
          title="Detailed schedule"
          subtitle="Each operation of each job with its work centre and dates."
          action={
            <>
              <ExportCsvButton name="schedule-detail" header={['Job', 'Operation', 'Work centre', 'Start', 'Finish', 'Hours']} rows={() => detail.map(({ j, o }) => [j.ref, o.name, wcName(o.wcId), o.start, o.finish, o.hours])} />
              <PrintButton title="Detailed schedule" html={() => `<h1>Detailed schedule</h1>${table(['Job', 'Operation', 'Work centre', 'Start', 'Finish', 'Hours'], detail.map(({ j, o }) => [j.ref, o.name, wcName(o.wcId), o.start, o.finish, o.hours]))}`} />
            </>
          }
        >
          <DataTable
            rows={detail}
            rowKey={(r) => r.id}
            pageSize={20}
            columns={[
              { key: 'r', header: 'Job', render: (r) => r.j.ref, sort: (r) => r.j.ref },
              { key: 'o', header: 'Operation', render: (r) => r.o.name },
              { key: 'w', header: 'Work centre', render: (r) => wcName(r.o.wcId), sort: (r) => r.o.wcId },
              { key: 's', header: 'Start', render: (r) => fmtDate(r.o.start), sort: (r) => r.o.start },
              { key: 'f', header: 'Finish', render: (r) => fmtDate(r.o.finish) },
              { key: 'h', header: 'Hours', align: 'right', render: (r) => r.o.hours }
            ]}
            empty="Nothing scheduled."
          />
        </Panel>
      )}

      {tab === 'moves' && (
        <Panel
          title="Production moves"
          subtitle="Tea lots issued to blends, blended tea and by-products made, rework, disassembly and outside-processing dispatches."
          action={<ExportCsvButton name="production-moves" header={['Date', 'Kind', 'Item', 'Qty', 'Unit', 'Reference', 'By']} rows={() => s.moves.map((m) => [m.date, m.kind, m.item, m.qty, m.unit, m.ref, m.by])} />}
        >
          <DataTable
            rows={s.moves}
            rowKey={(m) => m.id}
            initialSort={{ key: 'd', dir: 'desc' }}
            columns={[
              { key: 'd', header: 'Date', render: (m) => fmtDate(m.date), sort: (m) => m.date },
              { key: 'k', header: 'Kind', render: (m) => m.kind.replace(/_/g, ' ').toLowerCase() },
              { key: 'i', header: 'Item', render: (m) => m.item },
              { key: 'q', header: 'Qty', align: 'right', render: (m) => `${m.qty.toLocaleString()} ${m.unit}` },
              { key: 'r', header: 'Reference', render: (m) => m.ref },
              { key: 'b', header: 'By', render: (m) => m.by }
            ]}
            empty="No production moves."
          />
        </Panel>
      )}

      {tab === 'notices' && (
        <Panel title="Production notifications" subtitle="Simulated — this build has no mail or SMS gateway. Notices are recorded in the workspace outbox with the address they would go to, and in-app alerts appear in the header bell.">
          <DataTable
            rows={prodNotices}
            rowKey={(n) => n.id}
            initialSort={{ key: 'a', dir: 'desc' }}
            columns={[
              { key: 'a', header: 'Sent', render: (n) => n.at.replace('T', ' ').slice(0, 16), sort: (n) => n.at },
              { key: 'c', header: 'Channel', render: (n) => n.channel },
              { key: 'l', header: 'Level', render: (n) => <Pill status={n.level === 'critical' ? 'REJECTED' : n.level === 'warning' ? 'PENDING' : 'APPROVED'} label={n.level} /> },
              { key: 't', header: 'To', render: (n) => n.to },
              { key: 's', header: 'Subject', render: (n) => n.subject },
              { key: 'r', header: 'Reference', render: (n) => n.ref ?? '' }
            ]}
            empty="No production notices yet — approvals, a failed chop, a QC write-off or over-exposure will raise one."
          />
        </Panel>
      )}
    </SuitePage>
  );
};
