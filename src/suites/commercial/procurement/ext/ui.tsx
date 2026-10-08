import React from 'react';
import { Lock } from 'lucide-react';
import { esc } from '../../../../platform/Widgets';
import { fmtDate } from '../../../finance/engine';
import { Chips } from '../../../ui/kit';
import { code39, lineDiff } from './engine';
import type { ProcExtState, SourcingEvent } from './types';
import './procurement.css';

/** Notice shown on every procurement extension page to read-only sign-ins. */
export const ReadOnlyNote: React.FC<{ show: boolean }> = ({ show }) =>
  show ? (
    <div className="sx-callout warn">
      <Lock size={16} />
      <div>
        <b>Read-only account</b>
        <span>You can look at everything here but changes are refused.</span>
      </div>
    </div>
  ) : null;

export const Tabs = <T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string, number?][] }) => (
  <div className="prx-tabs">
    <Chips value={value} onChange={onChange} options={tabs.map(([v, label, count]) => ({ value: v, label, count }))} />
  </div>
);

/** Status pill tones for the extension's own statuses (mapped onto the kit pill palette). */
export const TONE: Record<string, string> = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  EVALUATION: 'SUBMITTED',
  AWARDED: 'POSTED',
  CANCELLED: 'VOID',
  PROSPECT: 'DRAFT',
  PENDING_APPROVAL: 'SUBMITTED',
  APPROVED: 'APPROVED',
  SUSPENDED: 'OVERDUE',
  TERMINATED: 'VOID',
  REJECTED: 'REJECTED',
  APPROVAL: 'SUBMITTED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'CLOSED',
  CAPTURED: 'DRAFT',
  ON_HOLD: 'OVERDUE',
  MATCHED: 'MATCHED',
  BILLED: 'POSTED',
  SUBMITTED: 'SUBMITTED',
  APPLIED: 'POSTED',
  PENDING: 'SUBMITTED',
  POSTED: 'POSTED',
  PICKING: 'OPEN',
  PART_ISSUED: 'PART_PAID',
  ISSUED: 'POSTED',
  DISPOSED: 'DISPOSED',
  RECEIVED: 'POSTED',
  SENT: 'OPEN',
  UNDER_REVIEW: 'SUBMITTED'
};
export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/* ---------------- Multi-field filter bar ---------------- */

export interface Filters {
  category: string;
  supplier: string;
  from: string;
  to: string;
  min: string;
  max: string;
}
export const NO_FILTERS: Filters = { category: '', supplier: '', from: '', to: '', min: '', max: '' };
export const passes = (f: Filters, row: { category?: string; supplier?: string; date?: string; value?: number }) =>
  (!f.category || row.category === f.category) &&
  (!f.supplier || row.supplier === f.supplier) &&
  (!f.from || (row.date ?? '') >= f.from) &&
  (!f.to || (row.date ?? '') <= f.to) &&
  (!f.min || (row.value ?? 0) >= Number(f.min)) &&
  (!f.max || (row.value ?? 0) <= Number(f.max));

export const FilterBar: React.FC<{ value: Filters; onChange: (f: Filters) => void; categories?: string[]; suppliers?: { id: string; name: string }[] }> = ({ value, onChange, categories, suppliers }) => {
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: v });
  const active = Object.values(value).some(Boolean);
  return (
    <div className="prx-filters" aria-label="Filters">
      {categories && (
        <select className="form-control" value={value.category} onChange={(e) => set('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      )}
      {suppliers && (
        <select className="form-control" value={value.supplier} onChange={(e) => set('supplier', e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <input className="form-control" type="date" value={value.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
      <input className="form-control" type="date" value={value.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
      <input className="form-control" type="number" min="0" placeholder="Min value" value={value.min} onChange={(e) => set('min', e.target.value)} aria-label="Minimum value" />
      <input className="form-control" type="number" min="0" placeholder="Max value" value={value.max} onChange={(e) => set('max', e.target.value)} aria-label="Maximum value" />
      {active && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
};

/* ---------------- Code 39 barcode ---------------- */

export const Barcode: React.FC<{ value: string; height?: number }> = ({ value, height = 40 }) => {
  const bars = code39(value);
  const width = bars.reduce((a, b) => a + b, 0);
  let x = 0;
  return (
    <svg className="prx-barcode" viewBox={`0 0 ${width} ${height + 12}`} width={Math.min(260, width * 1.6)} role="img" aria-label={`Barcode ${value}`}>
      {bars.map((w, i) => {
        const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={height} fill="currentColor" /> : null;
        x += w;
        return r;
      })}
      <text x={width / 2} y={height + 10} fontSize="9" textAnchor="middle" fill="currentColor">
        {value}
      </text>
    </svg>
  );
};
export const barcodeSvg = (value: string) => {
  const bars = code39(value);
  const width = bars.reduce((a, b) => a + b, 0);
  let x = 0;
  const rects = bars
    .map((w, i) => {
      const r = i % 2 === 0 ? `<rect x="${x}" y="0" width="${w}" height="40"/>` : '';
      x += w;
      return r;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} 52" width="${width * 1.6}" xmlns="http://www.w3.org/2000/svg">${rects}<text x="${width / 2}" y="50" font-size="9" text-anchor="middle">${esc(value)}</text></svg>`;
};

/* ---------------- Redline view ---------------- */

export const DiffView: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <pre className="prx-diff">
    {lineDiff(a, b).map((d, i) => (
      <div key={i} className={`prx-diff-${d.op}`}>
        {d.op === 'add' ? '+ ' : d.op === 'del' ? '− ' : '  '}
        {d.text || ' '}
      </div>
    ))}
  </pre>
);

/* ---------------- Live auction chart ---------------- */

const COLORS = ['#237857', '#c98f6b', '#5b7fb4', '#8b76aa', '#ddbd72', '#749ca0'];
export const BidChart: React.FC<{ e: SourcingEvent; name: (id: string) => string; anonymise?: string }> = ({ e, name, anonymise }) => {
  if (!e.bids.length) return <p className="sx-muted">No bids yet.</p>;
  const bids = [...e.bids].sort((a, b) => a.at.localeCompare(b.at));
  const t0 = new Date(bids[0].at).getTime();
  const t1 = Math.max(t0 + 60_000, new Date(bids[bids.length - 1].at).getTime());
  const max = Math.max(...bids.map((b) => b.amount));
  const min = Math.min(...bids.map((b) => b.amount));
  const W = 520;
  const H = 180;
  const px = (t: string) => 30 + ((new Date(t).getTime() - t0) / (t1 - t0)) * (W - 40);
  const py = (v: number) => 10 + ((max - v) / Math.max(1, max - min)) * (H - 30);
  const sups = [...new Set(bids.map((b) => b.supplierId))];
  return (
    <div className="prx-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bid history">
        <line x1="30" y1={H - 20} x2={W - 10} y2={H - 20} stroke="currentColor" opacity="0.2" />
        {sups.map((s, i) => {
          const pts = bids.filter((b) => b.supplierId === s);
          return (
            <g key={s} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}>
              <polyline fill="none" strokeWidth="2" points={pts.map((b) => `${px(b.at)},${py(b.amount)}`).join(' ')} />
              {pts.map((b) => (
                <circle key={b.id} cx={px(b.at)} cy={py(b.amount)} r="3">
                  <title>{`${anonymise && anonymise !== s ? 'Another bidder' : name(s)}: ${b.amount.toLocaleString()}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        <text x="2" y="14" fontSize="9" fill="currentColor">
          {max.toLocaleString()}
        </text>
        <text x="2" y={H - 22} fontSize="9" fill="currentColor">
          {min.toLocaleString()}
        </text>
      </svg>
      <div className="sx-legend">
        {sups.map((s, i) => (
          <span key={s}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            {anonymise && anonymise !== s ? `Bidder ${i + 1}` : name(s)}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ---------------- Printed documents (templates, branding, signatures) ---------------- */

const SW: Record<string, string> = {
  'Purchase order': 'Agizo la ununuzi',
  'Goods received note': 'Hati ya kupokea bidhaa',
  'Goods issue': 'Hati ya kutoa bidhaa',
  'Inbound delivery': 'Usafirishaji unaoingia',
  'Outbound delivery': 'Usafirishaji unaotoka',
  'Tea release order': 'Agizo la kutoa chai',
  'Shipping instruction': 'Maagizo ya usafirishaji',
  'Inward tally': 'Hesabu ya kuingia',
  'Outward tally': 'Hesabu ya kutoka',
  'Pick list': 'Orodha ya kuchukua',
  'Pro-forma invoice': 'Ankara ya awali',
  'Packing slip': 'Orodha ya mzigo',
  Contract: 'Mkataba',
  Date: 'Tarehe',
  Item: 'Bidhaa',
  Quantity: 'Kiasi',
  Signed: 'Imesainiwa'
};
const bi = (en: string, both: boolean) => (both && SW[en] ? `${esc(en)} / <i>${esc(SW[en])}</i>` : esc(en));

/** HTML for a printed procurement document, laid out by its output template and the organisation's branding. */
export const docHtml = (
  s: Pick<ProcExtState, 'templates' | 'branding' | 'signatures'>,
  docType: string,
  number: string,
  meta: [string, string][],
  table: { head: string[]; rows: (string | number)[][] },
  opts: { party?: string; notes?: string; sigRef?: string; signers?: string[] } = {}
) => {
  const t = s.templates.find((x) => x.docType === docType) ?? { docType, title: docType, footer: '', showLogo: true, language: 'EN', showSignatures: true };
  const both = t.language === 'EN_SW';
  const sig = opts.sigRef ? s.signatures[opts.sigRef] : undefined;
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${esc(s.branding.colour)};padding-bottom:8px">
      <div>${t.showLogo ? `<div style="font-weight:800;font-size:18px;color:${esc(s.branding.colour)}">${esc(s.branding.logoText)}</div>` : ''}<div class="muted">${esc(s.branding.name)}</div></div>
      <div style="text-align:right"><h1>${bi(t.title, both)}</h1><div><b>${esc(number)}</b></div></div>
    </div>
    <table style="margin-top:12px">${meta.map(([k, v]) => `<tr><th style="width:30%">${bi(k, both)}</th><td>${esc(v)}</td></tr>`).join('')}${opts.party ? `<tr><th>Party</th><td>${esc(opts.party)}</td></tr>` : ''}</table>
    <table><thead><tr>${table.head.map((h) => `<th>${bi(h, both)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="r"' : ''}>${esc(typeof c === 'number' ? c.toLocaleString() : c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${opts.notes ? `<p>${esc(opts.notes)}</p>` : ''}
    ${t.showSignatures ? `<div class="sig">${(opts.signers ?? []).map((x) => `<div>${esc(x)}</div>`).join('')}${sig ? `<div><span style="font-family:'Brush Script MT',cursive;font-size:20px">${esc(sig.text)}</span><br/>${bi('Signed', both)}: ${esc(sig.by)} · ${esc(sig.at)} · ${esc(sig.meaning)}</div>` : ''}</div>` : ''}
    ${t.footer ? `<p class="muted" style="margin-top:24px;border-top:1px solid #ccc;padding-top:6px">${esc(t.footer)}</p>` : ''}`;
};

export const dateRange = (a?: string, b?: string) => [a, b].filter(Boolean).map((x) => fmtDate(x!.slice(0, 10))).join(' → ');
