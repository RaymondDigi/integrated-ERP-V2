import React, { useMemo, useState } from 'react';
import { PackageCheck, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import type { ReceiptResult } from '../../../data/securitySeed';
import { Card, Empty, Field, GuardInput, Modal, Pill, fmtStamp, useSecOrg, type Tone } from './shared';

const TONE: Record<ReceiptResult, Tone> = { 'Cleared to stores': 'success', 'Held — discrepancy': 'warning', 'Rejected at gate': 'danger' };
const FILTERS = ['All', 'Cleared to stores', 'Held — discrepancy', 'Rejected at gate'] as const;

/** Incoming deliveries checked at the gate against the PO and delivery note before stores receive them. */
export const GoodsInCard: React.FC = () => {
  const { goodsReceipts } = useApp();
  const { orgId } = useSecOrg();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      goodsReceipts
        .filter((r) => r.orgId === orgId && (filter === 'All' || r.result === filter) && (!q || `${r.supplier} ${r.poNo} ${r.dnNo} ${r.goods} ${r.vehicleReg}`.toLowerCase().includes(q)))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [goodsReceipts, orgId, filter, q]
  );
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);

  return (
    <Card
      title="Incoming goods inspection"
      sub="Supplier deliveries counted at the gate against the purchase order and delivery note. Only cleared goods go on to stores receipt."
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <PackageCheck size={14} /> Check a delivery
        </button>
      }
    >
      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search supplier, PO, delivery note..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          {FILTERS.map((k) => (
            <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Arrived</th>
              <th>Supplier</th>
              <th>PO / delivery note</th>
              <th>Goods</th>
              <th>On note</th>
              <th>Counted</th>
              <th>Vehicle</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={8}>No deliveries match.</Empty>}
            {pg.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {fmtStamp(r.at)}
                  <div className="hi-sub">{r.guard}</div>
                </td>
                <td className="hi-wrap">{r.supplier}</td>
                <td>
                  <div className="hi-mono">{r.poNo}</div>
                  <div className="hi-sub">{r.dnNo}</div>
                </td>
                <td className="hi-wrap">{r.goods}</td>
                <td>
                  {r.qtyOnNote.toLocaleString()} {r.unit}
                </td>
                <td style={r.qtyCounted !== r.qtyOnNote ? { color: 'var(--status-critical)', fontWeight: 600 } : undefined}>
                  {r.qtyCounted.toLocaleString()} {r.unit}
                </td>
                <td>
                  {r.vehicleReg}
                  <div className="hi-sub">{r.driver}</div>
                </td>
                <td className="hi-wrap">
                  <Pill tone={TONE[r.result]}>{r.result}</Pill>
                  {r.note && <div className="hi-sub">{r.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="deliveries" sizes={[10, 25, 50]} />
      {adding && <ReceiptModal onClose={() => setAdding(false)} />}
    </Card>
  );
};

const ReceiptModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { recordGoodsReceipt } = useApp();
  const { guards } = useSecOrg();
  const [supplier, setSupplier] = useState('');
  const [poNo, setPoNo] = useState('');
  const [dnNo, setDnNo] = useState('');
  const [goods, setGoods] = useState('');
  const [qtyOnNote, setQtyOnNote] = useState('');
  const [qtyCounted, setQtyCounted] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [vehicleReg, setVehicleReg] = useState('');
  const [driver, setDriver] = useState('');
  const [guard, setGuard] = useState(guards[0] ?? '');
  const [reject, setReject] = useState(false);
  const [note, setNote] = useState('');
  const short = qtyOnNote !== '' && qtyCounted !== '' && Number(qtyOnNote) !== Number(qtyCounted);
  const result: ReceiptResult = reject ? 'Rejected at gate' : short ? 'Held — discrepancy' : 'Cleared to stores';
  const ok = supplier.trim() && poNo.trim() && dnNo.trim() && goods.trim() && qtyOnNote !== '' && qtyCounted !== '' && guard.trim() && (result === 'Cleared to stores' || note.trim());
  return (
    <Modal
      title="Check an incoming delivery"
      subtitle="Match the delivery note to the purchase order and count what is on the vehicle."
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              recordGoodsReceipt({
                supplier: supplier.trim(),
                poNo: poNo.trim(),
                dnNo: dnNo.trim(),
                goods: goods.trim(),
                qtyOnNote: Number(qtyOnNote),
                qtyCounted: Number(qtyCounted),
                unit: unit.trim(),
                vehicleReg: vehicleReg.trim() || '—',
                driver: driver.trim() || '—',
                guard: guard.trim(),
                result,
                note: note.trim()
              });
              onClose();
            }}
          >
            Record: {result}
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Supplier">
          <input className="form-control" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
        <Field label="Purchase order no.">
          <input className="form-control" value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="PO-…" />
        </Field>
        <Field label="Delivery note no.">
          <input className="form-control" value={dnNo} onChange={(e) => setDnNo(e.target.value)} />
        </Field>
        <Field label="Goods">
          <input className="form-control" value={goods} onChange={(e) => setGoods(e.target.value)} />
        </Field>
        <Field label="Quantity on delivery note">
          <input className="form-control" type="number" min={0} value={qtyOnNote} onChange={(e) => setQtyOnNote(e.target.value)} />
        </Field>
        <Field label="Quantity counted">
          <input className="form-control" type="number" min={0} value={qtyCounted} onChange={(e) => setQtyCounted(e.target.value)} />
        </Field>
        <Field label="Unit">
          <input className="form-control" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Guard">
          <GuardInput id="gr-guard" value={guard} onChange={setGuard} guards={guards} />
        </Field>
        <Field label="Vehicle registration">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </Field>
        <Field label="Reject at gate?" hint="Wrong goods, broken seals or tampering">
          <select className="form-control" value={reject ? 'yes' : 'no'} onChange={(e) => setReject(e.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes, turn the delivery away</option>
          </select>
        </Field>
        <Field label="Note" hint={result === 'Cleared to stores' ? 'Optional' : 'Required: what is wrong and what happens next'} wide>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {short && !reject && <div className="pr-note warn">Counted quantity differs from the delivery note. The delivery will be held and flagged.</div>}
    </Modal>
  );
};
