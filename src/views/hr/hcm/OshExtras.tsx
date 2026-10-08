import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { DataTable, Field, Panel } from '../../../suites/ui/kit';
import { PPE_ITEMS } from '../../../data/oshConfig';
import { ENV_LIMITS, type AuditFinding, type WorkEnvMeasurement } from '../../../data/hcmConfig';
import { fmt, todayIso } from '../../../data/hcmEngine';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/** OSH › PPE: requisitions approved by the safety officer, issued against stores stock. */
export const PpeRequisitions: React.FC = () => {
  const { ppeRequests, ppeStock, requestPpe, decidePpe, issuePpeRequest, receivePpeStock, tenantEmployees } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const depts = [...new Set(tenantEmployees.map((e) => e.department))].sort();
  const [r, setR] = useState({ staffId: '', department: depts[0] ?? '', item: 'BOOTS', qty: 1, reason: '' });
  const [rcv, setRcv] = useState({ item: 'BOOTS', qty: 10 });
  return (
    <Panel title="PPE requisitions & stores stock" subtitle="Supervisors request PPE; the safety officer approves; issue draws down stores stock and updates the employee's PPE register.">
      <div className="sx-grid">
        <Field label="Employee" required>
          <StaffSelect value={r.staffId} onChange={(v) => setR({ ...r, staffId: v })} />
        </Field>
        <Field label="Department">
          <select className="form-control" value={r.department} onChange={(e) => setR({ ...r, department: e.target.value })}>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Item">
          <select className="form-control" value={r.item} onChange={(e) => setR({ ...r, item: e.target.value })}>
            {Object.entries(PPE_ITEMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name} (stock {ppeStock[k] ?? 0})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qty each">
          <input className="form-control" type="number" value={r.qty} onChange={(e) => setR({ ...r, qty: Number(e.target.value) })} />
        </Field>
        <Field label="Reason" required span={2}>
          <input className="form-control" value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} placeholder="New starter, replacement, damaged…" />
        </Field>
      </div>
      <Toolbar>
        <Btn primary disabled={!canEdit} onClick={() => requestPpe({ staffIds: r.staffId ? [r.staffId] : [], department: r.department, items: [{ item: r.item, qty: r.qty }], reason: r.reason }) && setR({ ...r, reason: '' })}>
          Request PPE
        </Btn>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          Receive into stores:
        </span>
        <select className="form-control" value={rcv.item} onChange={(e) => setRcv({ ...rcv, item: e.target.value })} aria-label="Receive item">
          {Object.entries(PPE_ITEMS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
        <input className="form-control" style={{ width: 80 }} type="number" value={rcv.qty} onChange={(e) => setRcv({ ...rcv, qty: Number(e.target.value) })} aria-label="Receive qty" />
        <Btn disabled={!canEdit} onClick={() => receivePpeStock(rcv.item, rcv.qty)}>
          Receive
        </Btn>
      </Toolbar>
      <DataTable
        rows={ppeRequests}
        rowKey={(x) => x.id}
        columns={[
          { key: 'id', header: 'Requisition', render: (x) => `${x.id} · ${x.department}` },
          { key: 'p', header: 'For', render: (x) => x.staffIds.map(nameOf).join(', ') },
          { key: 'i', header: 'Items', render: (x) => x.items.map((i) => `${PPE_ITEMS[i.item]?.name ?? i.item} × ${i.qty} (stock ${ppeStock[i.item] ?? 0})`).join('; ') },
          { key: 'r', header: 'Reason', render: (x) => x.reason },
          { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} /> },
          {
            key: 'x',
            header: '',
            render: (x) =>
              x.status === 'REQUESTED' ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Btn primary disabled={!canEdit} onClick={() => decidePpe(x.id, true)}>
                    Approve
                  </Btn>
                  <Btn disabled={!canEdit} onClick={() => decidePpe(x.id, false, 'Not due for replacement')}>
                    Decline
                  </Btn>
                </span>
              ) : x.status === 'APPROVED' ? (
                <Btn primary disabled={!canEdit} onClick={() => issuePpeRequest(x.id)}>
                  Issue from stores
                </Btn>
              ) : (
                <span className="muted">{x.issuedBy ? `Issued by ${x.issuedBy}` : x.approvedBy ?? ''}</span>
              )
          }
        ]}
      />
    </Panel>
  );
};

/** OSH › Statutory: external audit findings with corrective actions, work-environment readings and the periodic statutory returns. */
export const OshAuditAndReturns: React.FC = () => {
  const { auditFindings, addFinding, closeFinding, envMeasurements, addMeasurement, oshIncidents: incidents, wibaClaims, activeTenant } = useApp();
  const { canEdit } = useCanEdit();
  const [f, setF] = useState({ audit: 'DOSHS annual OSH audit', auditor: '', finding: '', severity: 'Minor' as AuditFinding['severity'], owner: '', due: '' });
  const [ev, setEv] = useState<Record<string, string>>({});
  const [m, setM] = useState({ date: todayIso(), parameter: 'Noise dB(A)' as WorkEnvMeasurement['parameter'], location: '', value: 0 });
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const inYear = (d?: string) => !!d && d.startsWith(year);
  const inc = incidents.filter((i) => inYear(i.occurredOn));
  const injuries = inc.filter((i) => i.kind === 'INJURY' || i.kind === 'OCCUPATIONAL_DISEASE');
  const claims = wibaClaims.filter((c) => inYear(c.notifiedOn));
  const env = envMeasurements.filter((x) => inYear(x.date));
  const breach = (x: WorkEnvMeasurement) => (x.limitIs === 'MAX' ? x.value > x.limit : x.value < x.limit);
  const returns: [string, string, string][] = [
    ['Annual OSH return (DOSHS)', `${inc.length} incidents reported, ${injuries.length} injuries, ${auditFindings.filter((x) => x.status === 'OPEN').length} audit findings open`, 'OSHA 2007 s.11 & s.21'],
    ['WIBA annual return', `${claims.length} work-injury claims, ${claims.filter((c) => !!c.paidOn).length} settled`, 'WIBA 2007 s.21'],
    ['Work-environment monitoring report', `${env.length} readings, ${env.filter(breach).length} above the exposure limit`, 'L.N. 25/2005 (noise), L.N. 60/2007 (dust)'],
    ['Audit corrective-action status', `${auditFindings.filter((x) => x.status === 'CLOSED').length} closed of ${auditFindings.length} findings`, 'OSHA 2007 s.11']
  ];
  return (
    <>
      <Panel title="External audit findings" subtitle="Each finding has an owner, due date and closure evidence; a manager or the owner closes it.">
        <div className="sx-grid">
          <Field label="Audit">
            <input className="form-control" value={f.audit} onChange={(e) => setF({ ...f, audit: e.target.value })} />
          </Field>
          <Field label="Auditor">
            <input className="form-control" value={f.auditor} onChange={(e) => setF({ ...f, auditor: e.target.value })} />
          </Field>
          <Field label="Finding" required span={2}>
            <input className="form-control" value={f.finding} onChange={(e) => setF({ ...f, finding: e.target.value })} />
          </Field>
          <Field label="Severity">
            <select className="form-control" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as AuditFinding['severity'] })}>
              <option>Major</option>
              <option>Minor</option>
              <option>Observation</option>
            </select>
          </Field>
          <Field label="Owner" required>
            <input className="form-control" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
          </Field>
          <Field label="Due" required>
            <input className="form-control" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => addFinding(f) && setF({ ...f, finding: '' })}>
            Add finding
          </Btn>
        </Toolbar>
        <DataTable
          rows={auditFindings}
          rowKey={(x) => x.id}
          columns={[
            { key: 'a', header: 'Audit', render: (x) => `${x.audit} · ${x.auditor}` },
            { key: 'f', header: 'Finding', render: (x) => `${x.finding} (${x.severity})` },
            { key: 'o', header: 'Owner / due', render: (x) => <span style={{ color: x.status === 'OPEN' && x.due < todayIso() ? 'var(--status-critical)' : undefined }}>{`${x.owner}, ${fmt(x.due)}`}</span> },
            { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} /> },
            {
              key: 'x',
              header: 'Corrective action',
              render: (x) =>
                x.status === 'OPEN' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" style={{ width: 180 }} placeholder="Evidence" value={ev[x.id] ?? ''} onChange={(e) => setEv({ ...ev, [x.id]: e.target.value })} />
                    <Btn disabled={!canEdit} onClick={() => closeFinding(x.id, ev[x.id] ?? '')}>
                      Close
                    </Btn>
                  </span>
                ) : (
                  `${x.evidence} (${x.closedBy}, ${fmt(x.closedOn)})`
                )
            }
          ]}
        />
      </Panel>
      <Panel title="Work-environment monitoring" subtitle="Noise, dust, lighting and heat readings against the exposure limits.">
        <Toolbar>
          <input className="form-control" style={{ width: 150 }} type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} aria-label="Date" />
          <select className="form-control" value={m.parameter} onChange={(e) => setM({ ...m, parameter: e.target.value as WorkEnvMeasurement['parameter'] })} aria-label="Parameter">
            {Object.keys(ENV_LIMITS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className="form-control" style={{ width: 180 }} placeholder="Location" value={m.location} onChange={(e) => setM({ ...m, location: e.target.value })} />
          <input className="form-control" style={{ width: 90 }} type="number" value={m.value} onChange={(e) => setM({ ...m, value: Number(e.target.value) })} aria-label="Value" />
          <Btn disabled={!canEdit} onClick={() => addMeasurement(m)}>
            Record reading
          </Btn>
        </Toolbar>
        <DataTable
          rows={envMeasurements}
          rowKey={(x) => x.id}
          columns={[
            { key: 'd', header: 'Date', render: (x) => fmt(x.date) },
            { key: 'p', header: 'Parameter', render: (x) => x.parameter },
            { key: 'l', header: 'Location', render: (x) => x.location },
            { key: 'v', header: 'Reading', align: 'right', render: (x) => x.value },
            { key: 'm', header: 'Limit', render: (x) => `${x.limitIs === 'MAX' ? '≤' : '≥'} ${x.limit}` },
            { key: 's', header: 'Result', render: (x) => <StatusPill status={breach(x) ? 'OVERDUE' : 'ACTIVE'} label={breach(x) ? 'Outside limit' : 'Within limit'} /> }
          ]}
        />
      </Panel>
      <Panel
        title="Periodic statutory returns"
        subtitle={`Figures compiled from the registers for ${year}.`}
        action={
          <Toolbar>
            <select className="form-control" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {[0, 1, 2].map((i) => {
                const y = String(new Date().getFullYear() - i);
                return <option key={y}>{y}</option>;
              })}
            </select>
            <ExportCsvButton name={`OSH statutory returns ${year}`} header={['Return', 'Figures', 'Basis']} rows={() => returns} />
            <PrintButton title={`OSH statutory returns ${year}`} html={() => `<h1>OSH statutory returns ${esc(year)}</h1><p>${esc(activeTenant.name)}</p><table><thead><tr><th>Return</th><th>Figures</th><th>Basis</th></tr></thead><tbody>${returns.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`} />
          </Toolbar>
        }
      >
        <DataTable
          rows={returns}
          rowKey={(r) => r[0]}
          columns={[
            { key: 'r', header: 'Return', render: (r) => r[0] },
            { key: 'f', header: 'Figures', render: (r) => r[1] },
            { key: 'b', header: 'Basis', render: (r) => r[2] }
          ]}
        />
      </Panel>
    </>
  );
};
