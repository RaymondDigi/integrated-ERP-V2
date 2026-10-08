import React, { useState } from 'react';
import { FileDown, FileSignature, Printer, Save, Stamp } from 'lucide-react';
import { SignModal } from '../../../platform/Widgets';
import { downloadText } from '../../../platform/csv';
import { useAccess } from '../../../platform/access';
import { Chips, DataTable, Field, Panel, SuitePage, type Column } from '../../ui/kit';
import { ReadOnlyNote } from '../warehousing/ui';
import { asWordDoc, TEMPLATES, type DocCtx, type DocScope } from './docTemplates';
import { useShippingExt } from './store';
import type { GeneratedDoc, TemplateSettings } from './types';
import { useDocCtx } from './useDocCtx';

/** Records each template can be produced from. */
const useRecords = () => {
  const shp = useShippingExt();
  const { state, ops, wh, party } = shp;
  const out: Record<DocScope, { id: string; label: string; ctx: Partial<DocCtx>; ref: string; shipmentId?: string }[]> = {
    SHIPMENT: ops.state.shipments.map((s) => ({ id: s.id, label: `${s.number} — ${party(s.customerId)?.name} · ${s.destination}`, ref: s.number, shipmentId: s.id, ctx: { shipment: s, party: party(s.customerId), si: state.instructions.find((x) => x.id === s.siId) } })),
    SI: state.instructions.map((si) => ({ id: si.id, label: `${si.number} — ${party(si.customerId)?.name}`, ref: si.number, ctx: { si, party: party(si.customerId) } })),
    PLAN: wh.state.loadingPlans.map((p) => ({ id: p.id, label: `${p.number} — ${p.ref} · ${p.container || 'no container'}`, ref: p.number, shipmentId: p.shipmentId, ctx: { plan: p } })),
    LOT: wh.state.lots.map((l) => ({ id: l.id, label: `${l.lotNo} — ${l.garden} ${l.grade}`, ref: l.lotNo, ctx: { lot: l } })),
    ASN: wh.state.asns.filter((a) => a.tally).map((a) => ({ id: a.id, label: `${a.tally?.number} — ${a.number} · ${a.from}`, ref: a.tally?.number ?? a.number, ctx: { asn: a } })),
    WARRANT: wh.state.warrants.map((w) => ({ id: w.id, label: `${w.number} — ${w.holder}`, ref: w.number, ctx: { warrant: w } }))
  };
  return out;
};

export const TemplatesPage: React.FC = () => {
  const shp = useShippingExt();
  const { state, actor } = shp;
  const { readOnly } = useAccess();
  const docs = useDocCtx();
  const records = useRecords();
  const [tab, setTab] = useState<'generate' | 'register' | 'settings'>('generate');
  const [key, setKey] = useState('proforma');
  const tpl = TEMPLATES.find((t) => t.key === key)!;
  const choices = tpl.scope.flatMap((sc) => records[sc]);
  const [recId, setRecId] = useState<string>(choices[0]?.id ?? '');
  const rec = choices.find((r) => r.id === recId) ?? choices[0];
  const [grouping, setGrouping] = useState<'BAG' | 'ORDER' | 'SKU'>('BAG');
  const [signing, setSigning] = useState(false);
  const registered = rec ? state.generated.find((g) => g.template === key && g.ref === rec.ref) : undefined;
  const ctx: Partial<DocCtx> = rec ? { ...rec.ctx, grouping, number: registered?.number, signature: registered?.signature } : {};
  const html = rec ? docs.render(key, ctx) : '<p>No records for this template yet.</p>';
  const title = `${tpl.title} ${registered?.number ?? rec?.ref ?? ''}`.trim();
  const register = () => rec && shp.registerDoc(key, rec.ref, rec.shipmentId);
  const regCols: Column<GeneratedDoc>[] = [
    { key: 'n', header: 'Number', render: (g) => <b className="sx-mono">{g.number}</b>, sort: (g) => g.number },
    { key: 't', header: 'Document', render: (g) => TEMPLATES.find((t) => t.key === g.template)?.title ?? g.template },
    { key: 'r', header: 'For', render: (g) => <span className="sx-mono">{g.ref}</span> },
    { key: 'b', header: 'Issued', render: (g) => `${g.by} · ${g.at}` },
    { key: 's', header: 'Signature', render: (g) => (g.signature ? `${g.signature.by} · ${g.signature.at}` : <span className="sx-muted">unsigned</span>) }
  ];
  return (
    <SuitePage eyebrow="Shipping" title="Document templates" subtitle="Generate proforma and commercial invoices, packing lists, bills of exchange, bank instructions, booking confirmations, loading plans, VGM, stock cards, tally sheets and warrants from live records — print, export to Word, number and e-sign them.">
      <ReadOnlyNote />
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'generate', label: 'Generate' },
          { value: 'register', label: `Issued documents (${state.generated.length})` },
          { value: 'settings', label: 'Template settings' }
        ]}
      />
      {tab === 'generate' && (
        <>
          <div className="sx-toolbar">
            <select
              className="form-control"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                const t = TEMPLATES.find((x) => x.key === e.target.value)!;
                setRecId(t.scope.flatMap((sc) => records[sc])[0]?.id ?? '');
              }}
              aria-label="Template"
            >
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </select>
            <select className="form-control" value={rec?.id ?? ''} onChange={(e) => setRecId(e.target.value)} aria-label="Record">
              {choices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {key === 'packing' && (
              <select className="form-control" value={grouping} onChange={(e) => setGrouping(e.target.value as typeof grouping)} aria-label="Packing list grouping">
                <option value="BAG">Per bag</option>
                <option value="ORDER">Per order / invoice</option>
                <option value="SKU">Per grade (SKU)</option>
              </select>
            )}
          </div>
          <div className="sx-toolbar">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!rec} onClick={() => docs.print(key, title, ctx)}>
              <Printer size={14} /> Print / PDF
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!rec} onClick={() => downloadText(`${title.replace(/[^\w-]+/g, '-')}.doc`, asWordDoc(title, html), 'application/msword')}>
              <FileDown size={14} /> Export to Word
            </button>
            {!readOnly && (
              <>
                <button type="button" className="btn btn-primary btn-sm" disabled={!rec || !!registered} onClick={register}>
                  <Stamp size={14} /> {registered ? `Registered ${registered.number}` : 'Register & number'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!rec || !!registered?.signature} onClick={() => setSigning(true)}>
                  <FileSignature size={14} /> {registered?.signature ? `Signed by ${registered.signature.by}` : 'Sign electronically'}
                </button>
              </>
            )}
          </div>
          <Panel title={tpl.title} subtitle={registered ? `${registered.number} · issued by ${registered.by}` : 'Preview — not yet registered'}>
            <iframe title="Document preview" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px/1.45 system-ui,Arial,sans-serif;margin:18px;color:#111;background:#fff}h1{font-size:18px;margin:0}h2{font-size:14px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}.r{text-align:right}.muted{color:#666}.sig{display:flex;gap:40px;margin-top:30px}.sig>div{flex:1;border-top:1px solid #333;padding-top:4px}</style></head><body>${html}</body></html>`} style={{ width: '100%', height: 560, border: '1px solid var(--sx-line, #ddd)', borderRadius: 8, background: '#fff' }} />
          </Panel>
          {signing && rec && (
            <SignModal
              signer={actor.name}
              meaning={`Issued and authorised: ${tpl.title} for ${rec.ref}`}
              onClose={() => setSigning(false)}
              onSign={(sig) => shp.registerDoc(key, rec.ref, rec.shipmentId, { by: sig.by, at: sig.at, text: sig.text, meaning: sig.meaning })}
            />
          )}
        </>
      )}
      {tab === 'register' && <DataTable rows={state.generated} columns={regCols} rowKey={(g) => g.id} initialSort={{ key: 'n', dir: 'desc' }} empty="No documents issued yet" />}
      {tab === 'settings' && <SettingsForm />}
    </SuitePage>
  );
};

const SettingsForm: React.FC = () => {
  const shp = useShippingExt();
  const { readOnly } = useAccess();
  const [t, setT] = useState<TemplateSettings>(shp.state.templates);
  const f = (k: keyof TemplateSettings, label: string, hint?: string) => (
    <Field label={label} span={2} hint={hint}>
      <textarea className="form-control" rows={2} value={t[k]} disabled={readOnly} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
    </Field>
  );
  return (
    <Panel title="Template settings" subtitle="Used on every generated document; each change is written to the audit trail">
      <div className="sx-grid sx-grid-2">
        {f('header', 'Letterhead name')}
        {f('address', 'Address & contacts')}
        {f('bank', 'Bank details', 'Shown on invoices and bank instructions')}
        {f('drawee', 'Default drawee (bill of exchange)')}
        {f('footer', 'Footer / terms')}
      </div>
      {!readOnly && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.saveTemplates(t)}>
          <Save size={14} /> Save settings
        </button>
      )}
    </Panel>
  );
};
