import React, { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import type { Campaign } from '../tradeTypes';
import { Panel, Stat, SuitePage } from '../../ui/kit';
import { salesFacts } from '../tradeEngine';

const blank = (): Campaign => ({ code: '', name: '', channel: 'EMAIL', from: TODAY, to: addDays(TODAY, 30), cost: 0, owner: '' });

/** Marketing campaigns with source codes captured on quotes and orders, and their return on investment. */
export const CampaignsPage: React.FC = () => {
  const { state, finance, actor, saveCampaign } = useCommercial();
  const [d, setD] = useState<Campaign>(() => ({ ...blank(), owner: actor.name }));
  const isNew = !state.campaigns.some((c) => c.code === d.code);
  const facts = salesFacts(state, finance.state);
  const rows = state.campaigns.map((c) => {
    const f = facts.filter((x) => x.source === c.code);
    const revenue = round2(f.reduce((x, y) => x + y.revenue, 0));
    const margin = round2(f.reduce((x, y) => x + y.margin, 0));
    const quotes = state.quotations.filter((q) => q.sourceCode === c.code);
    const orders = state.orders.filter((o) => o.sourceCode === c.code && o.status !== 'VOID');
    return { c, revenue, margin, quotes: quotes.length, orders: orders.length, conv: quotes.length ? Math.round((quotes.filter((q) => q.status === 'ACCEPTED').length / quotes.length) * 100) : null, roi: c.cost ? round2(((margin - c.cost) / c.cost) * 100) : null };
  });
  const live = state.campaigns.filter((c) => c.from <= TODAY && c.to >= TODAY);
  return (
    <SuitePage eyebrow="Business development" title="Campaigns" subtitle="Each campaign has a source code; sales staff pick it on quotes and orders so revenue and margin can be traced back to it.">
      <div className="sx-stats">
        <Stat label="Live campaigns" value={live.length} icon={<Megaphone size={17} />} />
        <Stat label="Spend" value={kes(state.campaigns.reduce((x, c) => x + c.cost, 0), { compact: true })} icon={<Megaphone size={17} />} tone="red" />
        <Stat label="Attributed revenue" value={kes(rows.reduce((x, r) => x + r.revenue, 0), { compact: true })} icon={<Megaphone size={17} />} tone="blue" />
      </div>
      <Panel title={isNew ? 'New campaign' : `Edit ${d.code}`}>
        <div className="tr-row">
          <input className="form-control" placeholder="Source code e.g. FEST-CAT" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} />
          <input className="form-control grow" placeholder="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <select className="form-control" aria-label="Channel" value={d.channel} onChange={(e) => setD({ ...d, channel: e.target.value as Campaign['channel'] })}>
            {['CATALOGUE', 'EMAIL', 'SMS', 'TRADE_FAIR', 'RADIO', 'SOCIAL'].map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </select>
          <input className="form-control" type="date" aria-label="From" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} />
          <input className="form-control" type="date" aria-label="To" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} />
          <input className="form-control" type="number" aria-label="Cost" value={d.cost} onChange={(e) => setD({ ...d, cost: Number(e.target.value) })} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveCampaign(d, isNew).ok && setD({ ...blank(), owner: actor.name })}>
            <Plus size={13} /> {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </Panel>
      <Panel title="Results" subtitle="Quotes and orders carrying the source code; ROI = (margin − cost) ÷ cost">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Campaign</th>
              <th>Period</th>
              <th style={{ textAlign: 'right' }}>Quotes</th>
              <th style={{ textAlign: 'right' }}>Won %</th>
              <th style={{ textAlign: 'right' }}>Orders</th>
              <th style={{ textAlign: 'right' }}>Revenue</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'right' }}>ROI</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.c.code}>
                <td className="sx-mono">{r.c.code}</td>
                <td>
                  {r.c.name} <small className="sx-muted">{r.c.channel.toLowerCase()}</small>
                </td>
                <td>
                  {fmtDate(r.c.from)} – {fmtDate(r.c.to)}
                </td>
                <td style={{ textAlign: 'right' }}>{r.quotes}</td>
                <td style={{ textAlign: 'right' }}>{r.conv === null ? '—' : `${r.conv}%`}</td>
                <td style={{ textAlign: 'right' }}>{r.orders}</td>
                <td style={{ textAlign: 'right' }}>{kes(r.revenue)}</td>
                <td style={{ textAlign: 'right' }}>{kes(r.c.cost)}</td>
                <td style={{ textAlign: 'right' }}>{r.roi === null ? '—' : `${r.roi}%`}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD(r.c)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </SuitePage>
  );
};
