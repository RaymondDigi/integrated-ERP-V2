import React, { useState } from 'react';
import { Gavel, Printer, ScrollText, Stamp } from 'lucide-react';
import { ExportCsvButton, ImportCsvButton } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { fmtDate, kes } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, FlowSteps, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useDocCtx } from '../shipping/useDocCtx';
import { useWarehouseExt } from './store';
import type { AuctionInfo, TeaLot, Warrant } from './types';
import { num, ReadOnlyNote } from './ui';

const STEPS: AuctionInfo['status'][] = ['RECEIVED', 'CATALOGUED', 'SOLD', 'PAID', 'RELEASED', 'DELIVERED'];
const A_PILL: Record<AuctionInfo['status'], string> = { RECEIVED: 'DRAFT', CATALOGUED: 'SUBMITTED', SOLD: 'APPROVED', UNSOLD: 'OVERDUE', PAID: 'PART_PAID', RELEASED: 'OPEN', DELIVERED: 'POSTED' };
const W_PILL: Record<Warrant['status'], string> = { ISSUED: 'OPEN', ENDORSED: 'APPROVED', SURRENDERED: 'POSTED', CANCELLED: 'VOID' };
type Tab = 'lots' | 'warrants';

export const AuctionPage: React.FC = () => {
  const { state, partyName, importSaleResults } = useWarehouseExt();
  const docs = useDocCtx();
  const [tab, setTab] = useState<Tab>('lots');
  const [openId, setOpenId] = useState<string | null>(null);
  const lots = state.lots.filter((l) => l.auction);
  const cols: Column<TeaLot>[] = [
    { key: 'n', header: 'Lot', render: (l) => <b className="sx-mono">{l.lotNo}</b>, sort: (l) => l.lotNo },
    { key: 't', header: 'Tea', render: (l) => `${l.garden} ${l.grade} · ${l.invoiceNo}` },
    { key: 's', header: 'Sale / catalogue', render: (l) => `${l.auction!.saleNo}${l.auction!.catalogueNo ? ` · ${l.auction!.catalogueNo}` : ''}`, hideOnMobile: true },
    { key: 'k', header: 'Kg', render: (l) => num(l.netKg), align: 'right' },
    { key: 'p', header: 'Price', render: (l) => (l.auction!.priceUsd ? `USD ${l.auction!.priceUsd}` : l.auction!.valuationUsd ? <span className="sx-muted">val. {l.auction!.valuationUsd}</span> : '—'), align: 'right' },
    { key: 'b', header: 'Buyer', render: (l) => (l.auction!.buyer ? partyName(l.auction!.buyer) : '—'), hideOnMobile: true },
    { key: 'st', header: 'Status', render: (l) => <Pill status={A_PILL[l.auction!.status]} label={l.auction!.status.toLowerCase()} /> }
  ];
  const wcols: Column<Warrant>[] = [
    { key: 'n', header: 'Warrant', render: (w) => <b className="sx-mono">{w.number}</b> },
    { key: 'h', header: 'Holder', render: (w) => w.holder },
    { key: 'l', header: 'Lots', render: (w) => w.lotIds.map((id) => state.lots.find((l) => l.id === id)?.lotNo).join(', ') },
    { key: 'k', header: 'Kg', render: (w) => num(state.lots.filter((l) => w.lotIds.includes(l.id)).reduce((x, l) => x + l.netKg, 0)), align: 'right' },
    { key: 'i', header: 'Issued', render: (w) => fmtDate(w.issued) },
    { key: 's', header: 'Status', render: (w) => <Pill status={W_PILL[w.status]} label={w.status.toLowerCase()} /> },
    {
      key: 'p',
      header: '',
      render: (w) => (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => docs.print('warrant', `Warrant ${w.number}`, { warrant: w, number: w.number })}>
          <Printer size={12} /> Print
        </button>
      )
    }
  ];
  const open = state.lots.find((l) => l.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Auction & warrants"
      subtitle="Tea through the Mombasa auction: receipt, catalogue (sale offer), sale or return, prompt payment, ownership transfer, release against the warrant and outward delivery."
      actions={
        <>
          <ImportCsvButton label="Import sale results" template={['catalogueNo', 'lotNo', 'status', 'buyer', 'priceUsd']} onImport={importSaleResults} />
          <ExportCsvButton name="warrant-register" header={['warrant', 'holder', 'lots', 'kg', 'issued', 'status']} rows={() => state.warrants.map((w) => [w.number, w.holder, w.lotIds.map((id) => state.lots.find((l) => l.id === id)?.lotNo).join(' '), state.lots.filter((l) => w.lotIds.includes(l.id)).reduce((x, l) => x + l.netKg, 0), w.issued, w.status])} label="Warrant register" />
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Catalogued" value={lots.filter((l) => l.auction!.status === 'CATALOGUED').length} detail="On offer at the next sale" icon={<ScrollText size={17} />} />
        <Stat label="Sold, awaiting prompt" value={lots.filter((l) => l.auction!.status === 'SOLD').length} detail={kes(lots.filter((l) => l.auction!.status === 'SOLD').reduce((x, l) => x + l.netKg * (l.auction!.priceUsd ?? 0) * 129, 0), { compact: true })} icon={<Gavel size={17} />} tone="gold" />
        <Stat label="Unsold / returned" value={lots.filter((l) => l.auction!.status === 'UNSOLD').length} detail="Re-offer at the next sale" icon={<ScrollText size={17} />} tone="red" />
        <Stat label="Live warrants" value={state.warrants.filter((w) => w.status === 'ISSUED' || w.status === 'ENDORSED').length} icon={<Stamp size={17} />} tone="violet" onClick={() => setTab('warrants')} />
      </div>
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'lots', label: 'Auction lots', count: lots.length }, { value: 'warrants', label: 'Warrants', count: state.warrants.length }]} />
      </div>
      {tab === 'lots' ? <DataTable rows={lots} columns={cols} rowKey={(l) => l.id} onRowClick={(l) => setOpenId(l.id)} selected={openId} /> : <DataTable rows={state.warrants} columns={wcols} rowKey={(w) => w.id} />}
      <p className="sx-note">Any QC-passed lot can be offered: open it here once catalogued, or catalogue lots straight from the drawer below.</p>
      <AuctionCandidates onOpen={setOpenId} />
      {open && <AuctionDrawer lot={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const AuctionCandidates: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const { state } = useWarehouseExt();
  const cands = state.lots.filter((l) => !l.auction && l.status === 'IN_STOCK' && l.ownership === 'OWNED' && l.qc === 'PASS' && !l.reservedKg);
  return cands.length ? (
    <div className="sx-actions">
      {cands.slice(0, 6).map((l) => (
        <button key={l.id} type="button" className="btn btn-ghost btn-xs" onClick={() => onOpen(l.id)}>
          Offer {l.lotNo}
        </button>
      ))}
    </div>
  ) : null;
};

const AuctionDrawer: React.FC<{ lot: TeaLot; onClose: () => void }> = ({ lot, onClose }) => {
  const { state, actor, partyName, auctionStep, issueWarrant, warrantStep, ops } = useWarehouseExt();
  const { readOnly } = useAccess();
  const a = lot.auction ?? { saleNo: '', broker: '', status: 'RECEIVED' as const };
  const [sale, setSale] = useState({ saleNo: a.saleNo || 'Sale 42', catalogueNo: a.catalogueNo ?? '', broker: a.broker || 'Chartered Brokers', valuationUsd: a.valuationUsd ?? 0 });
  const [buyer, setBuyer] = useState(ops.finance.state.parties.find((p) => p.kind === 'CUSTOMER')?.id ?? '');
  const [price, setPrice] = useState(a.valuationUsd ?? 0);
  const [holder, setHolder] = useState(a.broker || 'Chartered Brokers');
  const warrant = state.warrants.find((w) => w.lotIds.includes(lot.id) && w.status !== 'CANCELLED');
  const customers = ops.finance.state.parties.filter((p) => p.kind === 'CUSTOMER');
  return (
    <Drawer wide title={`${lot.lotNo} — ${lot.garden} ${lot.grade}`} subtitle={`${num(lot.netKg)} kg · ${lot.bags} bags · ${a.saleNo || 'not yet offered'}`} badge={<Pill status={A_PILL[a.status]} label={a.status.toLowerCase()} />} onClose={onClose}>
      <FlowSteps steps={STEPS.map((s) => s.charAt(0) + s.slice(1).toLowerCase())} at={a.status === 'UNSOLD' ? 1 : STEPS.indexOf(a.status)} note={a.status === 'UNSOLD' ? { 1: 'Returned unsold' } : undefined} />
      <DefList items={[['Broker', a.broker || '—'], ['Valuation', a.valuationUsd ? `USD ${a.valuationUsd}/kg` : '—'], ['Buyer', a.buyer ? partyName(a.buyer) : '—'], ['Hammer price', a.priceUsd ? `USD ${a.priceUsd}/kg` : '—'], ['Prompt date', a.promptDate ? fmtDate(a.promptDate) : '—'], ['Owner now', partyName(lot.owner)], ['Warrant', warrant ? `${warrant.number} · ${warrant.status.toLowerCase()} · ${warrant.holder}` : 'None']]} />
      {!readOnly && (
        <>
          {(a.status === 'RECEIVED' || a.status === 'UNSOLD') && (
            <div className="sx-grid">
              <Field label="Sale no.">
                <input className="form-control" value={sale.saleNo} onChange={(e) => setSale({ ...sale, saleNo: e.target.value })} />
              </Field>
              <Field label="Catalogue lot no.">
                <input className="form-control" value={sale.catalogueNo} onChange={(e) => setSale({ ...sale, catalogueNo: e.target.value })} placeholder="C42-031" />
              </Field>
              <Field label="Broker">
                <input className="form-control" value={sale.broker} onChange={(e) => setSale({ ...sale, broker: e.target.value })} />
              </Field>
              <Field label="Valuation USD/kg">
                <input className="form-control" type="number" step="0.01" value={sale.valuationUsd || ''} onChange={(e) => setSale({ ...sale, valuationUsd: Number(e.target.value) })} />
              </Field>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => auctionStep(lot.id, 'CATALOGUE', sale)}>
                Catalogue for sale
              </button>
            </div>
          )}
          {a.status === 'CATALOGUED' && (
            <div className="sx-inline-form">
              <select className="form-control" value={buyer} onChange={(e) => setBuyer(e.target.value)} aria-label="Buyer">
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input className="form-control" type="number" step="0.01" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} placeholder="USD per kg" aria-label="Hammer price" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => auctionStep(lot.id, 'SOLD', { buyer, priceUsd: price })}>
                Record sale
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => auctionStep(lot.id, 'UNSOLD')}>
                Unsold — return
              </button>
            </div>
          )}
          {a.status === 'SOLD' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => auctionStep(lot.id, 'PAID')}>
              Prompt payment received
            </button>
          )}
          {a.status === 'PAID' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => auctionStep(lot.id, 'RELEASE')}>
              Release tea to the buyer (ownership transfer)
            </button>
          )}
          {a.status === 'RELEASED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => auctionStep(lot.id, 'DELIVER')}>
              Outward delivery
            </button>
          )}
          <h4 className="sx-subhead">Warehouse warrant</h4>
          <div className="sx-inline-form">
            <input className="form-control" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Holder / endorsee" aria-label="Warrant holder" />
            {!warrant && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => issueWarrant([lot.id], holder)}>
                Issue warrant
              </button>
            )}
            {warrant?.status === 'ISSUED' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => warrantStep(warrant.id, 'ENDORSE', holder)}>
                Endorse to holder
              </button>
            )}
            {warrant && (warrant.status === 'ISSUED' || warrant.status === 'ENDORSED') && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => warrantStep(warrant.id, 'SURRENDER')}>
                Surrender
              </button>
            )}
          </div>
          <p className="sx-note">Acting as {actor.name}. Auction steps: Operations Officer · release and delivery: Stores · warrants: Stores or Manager.</p>
        </>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={lot.history} />
      {warrant && <Timeline items={warrant.history} />}
    </Drawer>
  );
};
