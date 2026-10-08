import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { useCommercial } from '../store';
import { orderStage } from '../engine';
import { fmtDate, round2 } from '../../finance/engine';
import type { SalesOrder } from '../types';
import { Panel } from '../../ui/kit';
import { profileOf, shipWeight } from '../tradeEngine';

const VEHICLES = [
  { id: 'KCA 512Q', kg: 3000 },
  { id: 'KDB 220T', kg: 7000 },
  { id: 'KCY 908M', kg: 1500 }
];

/** Load consolidation: open orders grouped by warehouse and delivery zone, packed onto vehicles by weight and priority. */
export const LoadPlanner: React.FC = () => {
  const { state, party, setTrading } = useCommercial();
  const [cap, setCap] = useState(VEHICLES[0].kg);
  const open = state.orders.filter((o) => (orderStage(o) === 'TO_DISPATCH' || orderStage(o) === 'PART_DELIVERED') && !o.hold);
  const keyOf = (o: SalesOrder) => {
    const ship = profileOf(state, o.customerId).shipTos.find((x) => x.id === o.shipToId);
    return `${ship?.defaultWarehouse ?? 'WH-NBO'} → ${ship?.zone ?? ship?.town ?? 'Nairobi'}`;
  };
  const weightOf = (o: SalesOrder) => shipWeight(o.lines.map((l) => ({ ...l, qty: l.qty - l.delivered })), state.products);
  const groups = new Map<string, SalesOrder[]>();
  for (const o of open) groups.set(keyOf(o), [...(groups.get(keyOf(o)) ?? []), o]);
  const loads = [...groups.entries()].flatMap(([route, list]) => {
    const sorted = [...list].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a.requiredBy.localeCompare(b.requiredBy));
    const out: { route: string; orders: SalesOrder[]; kg: number }[] = [];
    for (const o of sorted) {
      const w = weightOf(o);
      const fit = out.find((l) => l.kg + w <= cap);
      if (fit) {
        fit.orders.push(o);
        fit.kg = round2(fit.kg + w);
      } else out.push({ route, orders: [o], kg: w });
    }
    return out;
  });
  return (
    <Panel
      title="Load planning"
      subtitle="Orders waiting to ship, grouped by warehouse and route and packed by priority and required date"
      action={
        <select className="form-control" aria-label="Vehicle capacity" value={cap} onChange={(e) => setCap(Number(e.target.value))}>
          {VEHICLES.map((v) => (
            <option key={v.id} value={v.kg}>
              {v.id} · {v.kg.toLocaleString()} kg
            </option>
          ))}
        </select>
      }
    >
      {loads.length === 0 ? (
        <p className="sx-muted">Nothing waiting to ship.</p>
      ) : (
        <ul className="sx-list">
          {loads.map((l, i) => (
            <li key={i} style={{ flexWrap: 'wrap' }}>
              <Truck size={14} />
              <b>
                Load {i + 1} · {l.route}
              </b>
              <span className={l.kg > cap ? 'sx-danger-text' : 'sx-muted'}>
                {l.kg.toLocaleString()} kg of {cap.toLocaleString()} ({Math.round((l.kg / cap) * 100)}%)
              </span>
              {l.orders.map((o) => (
                <button key={o.id} type="button" className="btn btn-ghost btn-sm" onClick={() => setTrading('orders', o.id)}>
                  {o.number} · {party(o.customerId)?.name?.split(' ')[0]} · by {fmtDate(o.requiredBy)}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
