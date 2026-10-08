import React, { useState } from 'react';
import { Settings, Plus } from 'lucide-react';
import { useCommercial } from '../store';
import { kes } from '../../finance/engine';
import type { FreightRate, PaymentTerm, ReasonCode, ReasonKind } from '../tradeTypes';
import { Chips, Panel, SuitePage } from '../../ui/kit';
import { useNotices } from '../../../platform/outbox';
import { POSTAL } from '../tradeEngine';

type Tab = 'REASONS' | 'TERMS' | 'FREIGHT' | 'POSTAL' | 'OUTBOX';
const KIND_LABEL: Record<ReasonKind, string> = { QUOTE_LOST: 'Quote lost', QUOTE_CANCEL: 'Quote cancelled', ORDER_HOLD: 'Order hold', ORDER_CANCEL: 'Order cancelled', RMA: 'Return', CLAIM: 'Claim' };

/** Trading settings: reason codes, payment terms, freight rates, postal codes, and the customer message outbox. */
export const SetupPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('REASONS');
  return (
    <SuitePage eyebrow="Settings" title="Trading setup" subtitle="Lists the rest of Trading uses. Changes are made by the Commercial Manager.">
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'REASONS', label: 'Reason codes' },
            { value: 'TERMS', label: 'Payment terms' },
            { value: 'FREIGHT', label: 'Freight rates' },
            { value: 'POSTAL', label: 'Postal codes' },
            { value: 'OUTBOX', label: 'Customer messages' }
          ]}
        />
      </div>
      {tab === 'REASONS' && <Reasons />}
      {tab === 'TERMS' && <Terms />}
      {tab === 'FREIGHT' && <Freight />}
      {tab === 'POSTAL' && (
        <Panel title="Postal codes" subtitle="Used to fill in the town and county of one-time addresses and pick the freight zone">
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Town</th>
                <th>County</th>
                <th>Country</th>
                <th>Freight zone</th>
              </tr>
            </thead>
            <tbody>
              {POSTAL.map((p) => (
                <tr key={p.code}>
                  <td className="sx-mono">{p.code}</td>
                  <td>{p.town}</td>
                  <td>{p.county}</td>
                  <td>{p.country}</td>
                  <td>{p.zone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'OUTBOX' && <Outbox />}
    </SuitePage>
  );
};

const Reasons: React.FC = () => {
  const { state, saveReasonCode } = useCommercial();
  const [d, setD] = useState<ReasonCode>({ id: '', kind: 'ORDER_HOLD', label: '', active: true });
  return (
    <Panel title="Reason codes" subtitle="Used for lost and cancelled quotes, held and cancelled orders, returns and claims">
      <div className="tr-row">
        <select className="form-control" aria-label="Kind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as ReasonKind })}>
          {(Object.keys(KIND_LABEL) as ReasonKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input className="form-control grow" placeholder="Reason" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveReasonCode(d).ok && setD({ ...d, id: '', label: '' })}>
          <Plus size={13} /> {d.id ? 'Save' : 'Add'}
        </button>
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>Reason</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.reasonCodes.map((r) => (
            <tr key={r.id}>
              <td>{KIND_LABEL[r.kind]}</td>
              <td>{r.label}</td>
              <td>
                <input type="checkbox" aria-label={`Active ${r.label}`} checked={r.active} onChange={(e) => saveReasonCode({ ...r, active: e.target.checked })} />
              </td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD(r)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};

const Terms: React.FC = () => {
  const { state, savePaymentTerm } = useCommercial();
  const [d, setD] = useState<PaymentTerm>({ id: '', label: '', days: 30, discountPct: 0, discountDays: 0 });
  const isNew = !state.paymentTerms.some((t) => t.id === d.id);
  return (
    <Panel title="Payment terms" subtitle="Assigned per customer, per ship-to or per order line; invoices split by terms">
      <div className="tr-row">
        <input className="form-control" placeholder="Code" value={d.id} onChange={(e) => setD({ ...d, id: e.target.value })} />
        <input className="form-control grow" placeholder="Name" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
        <input className="form-control" type="number" aria-label="Days" value={d.days} onChange={(e) => setD({ ...d, days: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Early discount %" value={d.discountPct} onChange={(e) => setD({ ...d, discountPct: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Discount days" value={d.discountDays} onChange={(e) => setD({ ...d, discountDays: Number(e.target.value) })} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => savePaymentTerm(d, isNew).ok && setD({ id: '', label: '', days: 30, discountPct: 0, discountDays: 0 })}>
          {isNew ? 'Add' : 'Save'}
        </button>
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Days</th>
            <th>Early payment</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.paymentTerms.map((t) => (
            <tr key={t.id}>
              <td className="sx-mono">{t.id}</td>
              <td>{t.label}</td>
              <td>{t.days}</td>
              <td>{t.discountPct ? `${t.discountPct}% within ${t.discountDays} days` : '—'}</td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD(t)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};

const Freight: React.FC = () => {
  const { state, saveFreightRate } = useCommercial();
  const [d, setD] = useState<FreightRate>({ zone: '', perKg: 0, minCharge: 0, handling: 0 });
  return (
    <Panel title="Freight rates" subtitle="Per zone: KES per kg, minimum charge and handling. The order calculator adds them as charges.">
      <div className="tr-row">
        <input className="form-control" placeholder="Zone" value={d.zone} onChange={(e) => setD({ ...d, zone: e.target.value })} />
        <input className="form-control" type="number" aria-label="Per kg" value={d.perKg} onChange={(e) => setD({ ...d, perKg: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Minimum" value={d.minCharge} onChange={(e) => setD({ ...d, minCharge: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Handling" value={d.handling} onChange={(e) => setD({ ...d, handling: Number(e.target.value) })} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveFreightRate(d).ok && setD({ zone: '', perKg: 0, minCharge: 0, handling: 0 })}>
          Save
        </button>
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Zone</th>
            <th>Per kg</th>
            <th>Minimum</th>
            <th>Handling</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.freightRates.map((f) => (
            <tr key={f.zone}>
              <td>{f.zone}</td>
              <td>{kes(f.perKg)}</td>
              <td>{kes(f.minCharge)}</td>
              <td>{kes(f.handling)}</td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD(f)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};

const Outbox: React.FC = () => {
  const notices = useNotices().filter((n) => n.module === 'Trading' || n.module === 'Business Development');
  return (
    <Panel title="Customer messages" subtitle="Acknowledgements, dispatch, invoice, outbid and credit messages sent from Trading (email/SMS are simulated)">
      <div className="tr-sim">
        <Settings size={14} /> Email and SMS gateways are simulated — messages are recorded in the outbox, not sent.
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Channel</th>
            <th>To</th>
            <th>Subject</th>
            <th>Ref</th>
          </tr>
        </thead>
        <tbody>
          {notices.slice(0, 80).map((n) => (
            <tr key={n.id}>
              <td>{n.at}</td>
              <td>{n.channel}</td>
              <td>
                {n.to} <small className="sx-muted">{n.address}</small>
              </td>
              <td>{n.subject}</td>
              <td className="sx-mono">{n.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};
