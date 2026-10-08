import React, { createContext, useContext, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import { audit } from '../../../platform/audit';
import { notify } from '../../../platform/outbox';
import { addDays, localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import type { OpsRole } from '../types';
import { buildSensors, buildWarehouseExtSeed } from './data';
import { abcClasses, assignTasks, availableKg, billingFor, CONTAINER_SPEC, fefo, locationUsedKg, planContainer, scheduleDue, SENSOR_LIMITS, suggestSlot, TASK_MINUTES, vgmMethod2 } from './engine';
import type {
  Asn,
  AsnLine,
  ContainerType,
  HandlingUnit,
  ItemSetup,
  Load,
  LotMove,
  Msds,
  Ownership,
  PrintJob,
  ReportSchedule,
  Signature,
  StorageLocation,
  TallyLine,
  TaskType,
  TeaLot,
  WarehouseExtState,
  WarehouseTask,
  YardVisit
} from './types';

export type Result = { ok: true; id?: string } | { ok: false; error: string };
export const READ_ONLY = 'This is a read-only account — you can view records but not change them';

const Ctx = createContext<ReturnType<typeof useWarehouseExtStore> | null>(null);

const useWarehouseExtStore = () => {
  const { addToast } = useApp();
  const access = useAccess();
  const ops = useOperations();
  const { commercial, finance } = ops;
  const [state, setState] = useState<WarehouseExtState>(() => buildWarehouseExtSeed(commercial.state));
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;

  const commit = (next: WarehouseExtState) => {
    ref.current = next;
    setState(next);
  };
  const fail = (error: string): Result => {
    addToast({ type: 'error', title: 'Not allowed', message: error });
    return { ok: false, error };
  };
  const done = (title: string, message: string, id?: string): Result => {
    addToast({ type: 'success', title, message });
    return { ok: true, id };
  };
  const now = () => localStamp();
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const next = (s: WarehouseExtState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  /** Viewer sign-ins are read only; then the persona must hold one of the roles. */
  const guard = (roles: OpsRole[], why: string) => (!access.canWrite ? READ_ONLY : !is(...roles) ? why : null);
  const lotMove = (m: Omit<LotMove, 'id' | 'date' | 'by'>): LotMove => ({ ...m, id: uid('lm'), date: TODAY, by: actor.name });
  const whName = (id: string) => ops.state.warehouses.find((w) => w.id === id)?.name ?? id;
  const partyName = (id: string) => (id === 'OWN' ? 'Own stock' : (finance.snapshot().parties.find((p) => p.id === id)?.name ?? id));
  const lotOf = (id: string) => ref.current.lots.find((l) => l.id === id);
  const patchLot = (lots: TeaLot[], id: string, patch: Partial<TeaLot>, action?: string, note?: string) =>
    lots.map((l) => (l.id === id ? { ...l, ...patch, history: action ? [...l.history, log(action, note)] : l.history } : l));
  /** New warehouse task, assigned straight away to whoever has the most free time. */
  const withTask = (s: WarehouseExtState, type: TaskType, ref2: string, warehouseId: string, detail: string): WarehouseExtState => {
    const { number, sequence } = next(s, 'TSK');
    const task: WarehouseTask = { id: uid('tk'), number, type, ref: ref2, warehouseId, detail, minutes: TASK_MINUTES[type], status: 'OPEN', created: TODAY };
    const { tasks } = assignTasks([task, ...s.tasks], s.workers);
    return { ...s, sequence, tasks };
  };

  /* ================= Locations and slotting ================= */
  const saveLocation = (l: StorageLocation): Result => {
    const s = ref.current;
    const g = guard(['MANAGER', 'STOREKEEPER'], 'Locations are set up by Stores or the Operations Manager');
    if (g) return fail(g);
    if (!l.warehouseId || !l.block.trim() || !l.bay.trim() || !l.row.trim()) return fail('Enter the warehouse, block, bay and row');
    if (!(l.capacityKg > 0)) return fail('Capacity must be above zero');
    const clash = s.locations.find((x) => x.id !== l.id && x.warehouseId === l.warehouseId && x.block === l.block.trim().toUpperCase() && x.bay === l.bay.trim() && x.row === l.row.trim());
    if (clash) return fail('That block, bay and row already exists in this warehouse');
    const exists = s.locations.find((x) => x.id === l.id);
    const used = exists ? locationUsedKg(s, l.id) : 0;
    if (exists && l.capacityKg < used) return fail(`${used.toLocaleString()} kg is stored there — capacity cannot be lower`);
    if (exists && !l.active && used > 0) return fail('Empty the location before deactivating it');
    const clean = { ...l, block: l.block.trim().toUpperCase(), bay: l.bay.trim(), row: l.row.trim() };
    const id = exists ? l.id : `${l.warehouseId}-${clean.block}${clean.bay}${clean.row}-${uid('').slice(-3)}`;
    commit({ ...s, locations: exists ? s.locations.map((x) => (x.id === l.id ? clean : x)) : [...s.locations, { ...clean, id }] });
    audit({ module: 'Warehousing', by: actor.name, action: exists ? 'Location edited' : 'Location added', ref: `${clean.block}-${clean.bay}-${clean.row}`, note: whName(l.warehouseId) });
    return done(exists ? 'Location saved' : 'Location added', `${clean.block}-${clean.bay}-${clean.row}`, id);
  };
  /** Put away or re-slot a lot (and its handling units). */
  const moveLot = (lotId: string, locationId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores moves stock between locations — switch to John Kiprop');
    if (g) return fail(g);
    const lot = lotOf(lotId)!;
    const loc = s.locations.find((x) => x.id === locationId);
    if (!loc || !loc.active) return fail('Choose an active location');
    if (loc.warehouseId !== lot.warehouseId) return fail('That location is in another warehouse — transfer the lot first');
    if (loc.zone === 'QUARANTINE' && lot.qc !== 'HOLD' && lot.qc !== 'FAIL') return fail('Only held or failed lots go into quarantine');
    if (loc.zone !== 'QUARANTINE' && (lot.qc === 'HOLD' || lot.qc === 'FAIL')) return fail('Held or failed lots must stay in quarantine');
    const free = loc.capacityKg - locationUsedKg(s, loc.id);
    if (free < lot.netKg) return fail(`Only ${free.toLocaleString()} kg free at ${loc.block}-${loc.bay}-${loc.row}`);
    commit({
      ...s,
      lots: patchLot(s.lots, lotId, { locationId }, 'Moved', `${loc.block}-${loc.bay}-${loc.row}`),
      hus: s.hus.map((h) => (h.lotId === lotId && h.status === 'STORED' ? { ...h, locationId } : h)),
      lotMoves: [lotMove({ lotId, kind: 'PUTAWAY', kg: 0, bags: lot.bags, from: lot.locationId, to: locationId, ref: lot.lotNo }), ...s.lotMoves]
    });
    return done('Lot moved', `${lot.lotNo} → ${loc.block}-${loc.bay}-${loc.row}`);
  };

  /* ================= Quality hold ================= */
  const setQc = (lotId: string, qc: 'PASS' | 'HOLD' | 'FAIL', note: string): Result => {
    const s = ref.current;
    const g = guard(['QC'], 'Quality status is set by the Quality Controller — switch to Faith Akinyi');
    if (g) return fail(g);
    const lot = lotOf(lotId)!;
    if (lot.status !== 'IN_STOCK') return fail('This lot is no longer in stock');
    if (lot.qc === qc) return fail(`The lot is already ${qc.toLowerCase()}`);
    if (qc !== 'PASS' && !note.trim()) return fail('Record why the lot is held or failed');
    if (qc !== 'PASS' && lot.reservedKg > 0) return fail(`${lot.reservedKg.toLocaleString()} kg is reserved for ${lot.reservedFor} — release it from the shipping instruction first`);
    // Held and failed tea moves to quarantine; released tea back to a general slot
    const slot = qc === 'PASS' ? suggestSlot(s, lot.warehouseId, lot.grade, lot.netKg) : suggestSlot(s, lot.warehouseId, lot.grade, lot.netKg, true);
    const locationId = slot?.id ?? lot.locationId;
    let nx: WarehouseExtState = {
      ...s,
      lots: patchLot(s.lots, lotId, { qc, qcNote: note || undefined, locationId }, qc === 'PASS' ? 'Released by QC' : qc === 'HOLD' ? 'Put on QC hold' : 'Failed QC', note || undefined),
      hus: s.hus.map((h) => (h.lotId === lotId && h.status === 'STORED' ? { ...h, locationId } : h)),
      lotMoves: [lotMove({ lotId, kind: 'QC', kg: 0, bags: lot.bags, from: lot.locationId, to: locationId, ref: lot.lotNo, note: `${lot.qc} → ${qc}${note ? ` · ${note}` : ''}` }), ...s.lotMoves]
    };
    if (slot && slot.id !== lot.locationId) nx = withTask(nx, 'PUTAWAY', lot.lotNo, lot.warehouseId, `Move ${lot.lotNo} to ${slot.block}-${slot.bay}-${slot.row}${qc === 'PASS' ? '' : ' (quarantine)'}`);
    commit(nx);
    audit({ module: 'Warehousing', by: actor.name, action: 'QC status', ref: lot.lotNo, field: 'qc', before: lot.qc, after: qc, note });
    if (qc !== 'PASS') notify({ module: 'Warehousing', to: 'Trading & Operations Manager', subject: `Lot ${lot.lotNo} ${qc === 'HOLD' ? 'on QC hold' : 'failed QC'}`, body: `${lot.garden} ${lot.grade}, ${lot.netKg.toLocaleString()} kg — ${note}. Excluded from available stock.`, ref: lot.lotNo, level: qc === 'FAIL' ? 'critical' : 'warning' });
    return done(qc === 'PASS' ? 'Released from hold' : qc === 'HOLD' ? 'Lot on hold' : 'Lot failed', `${lot.lotNo}${slot ? ` → ${slot.block}-${slot.bay}-${slot.row}` : ''}`);
  };

  /* ================= Ownership, consignment and reservations ================= */
  const transferOwnership = (lotId: string, owner: string, ownership: Ownership, note: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Ownership transfers are approved by the Operations Manager');
    if (g) return fail(g);
    const lot = lotOf(lotId)!;
    if (lot.owner === owner && lot.ownership === ownership) return fail('Nothing changes');
    if (lot.reservedKg > 0) return fail(`Release the ${lot.reservedKg.toLocaleString()} kg reserved for ${lot.reservedFor} first`);
    if (!note.trim()) return fail('Give the reason or contract reference');
    commit({
      ...s,
      lots: patchLot(s.lots, lotId, { owner, ownership }, 'Ownership transferred', `${partyName(lot.owner)} → ${partyName(owner)} · ${note}`),
      lotMoves: [lotMove({ lotId, kind: 'OWNERSHIP', kg: 0, bags: lot.bags, from: lot.owner, to: owner, ref: note }), ...s.lotMoves]
    });
    audit({ module: 'Warehousing', by: actor.name, action: 'Ownership transferred', ref: lot.lotNo, field: 'owner', before: partyName(lot.owner), after: partyName(owner), note });
    return done('Ownership transferred', `${lot.lotNo} now belongs to ${partyName(owner)}`);
  };
  /** Vendor-managed (consignment) tea becomes ours when used: the supplier is billed for what we consume. */
  const consumeConsignment = (lotId: string, kg: number): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores issues consignment stock');
    if (g) return fail(g);
    const lot = lotOf(lotId)!;
    if (lot.ownership !== 'CONSIGNMENT' || !lot.supplierId) return fail('This is not consignment stock');
    if (!(kg > 0) || kg > availableKg(lot)) return fail(`Enter up to ${availableKg(lot).toLocaleString()} kg`);
    const r = finance.saveDocument(
      {
        kind: 'BILL',
        partyId: lot.supplierId,
        date: TODAY,
        dueDate: addDays(TODAY, 30),
        reference: `Consignment ${lot.lotNo}`,
        department: 'Operations',
        notes: `Consumed ${kg} kg of consignment lot ${lot.lotNo} (${lot.garden} ${lot.grade})`,
        lines: [{ id: uid('l'), description: `${lot.garden} ${lot.grade} — ${kg} kg @ ${lot.costPerKg}`, account: '5000', qty: kg, price: lot.costPerKg, vat: false }]
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const bill = finance.snapshot().documents.find((x) => x.id === r.id)!;
    const bags = Math.round(kg / lot.kgPerBag);
    const left = round2(lot.netKg - kg);
    commit({
      ...s,
      lots: patchLot(s.lots, lotId, { netKg: left, bags: Math.max(0, lot.bags - bags), status: left <= 0 ? 'DEPLETED' : 'IN_STOCK' }, 'Consignment consumed', `${kg} kg · supplier bill ${bill.number}`),
      lotMoves: [lotMove({ lotId, kind: 'CONSUMPTION', kg: -kg, bags: -bags, from: lot.warehouseId, ref: bill.number }), ...s.lotMoves]
    });
    return done('Consignment consumed', `${kg} kg · supplier bill ${bill.number} raised in Finance`);
  };
  /** Reserve tea against a shipping instruction (called when the SI is confirmed). */
  const reserveLots = (si: string, lines: { lotId: string; kg: number }[]): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    for (const l of lines) {
      const lot = lotOf(l.lotId);
      if (!lot) return fail('Unknown lot');
      if (lot.reservedFor && lot.reservedFor !== si && lot.reservedKg > 0) return fail(`${lot.lotNo} is already reserved for ${lot.reservedFor}`);
      if (availableKg(lot) + (lot.reservedFor === si ? lot.reservedKg : 0) < l.kg) return fail(`${lot.lotNo}: only ${availableKg(lot).toLocaleString()} kg available (QC-passed, unreserved)`);
    }
    let lots = s.lots;
    const moves: LotMove[] = [];
    for (const l of lines) {
      const lot = lots.find((x) => x.id === l.lotId)!;
      lots = patchLot(lots, l.lotId, { reservedKg: l.kg, reservedFor: si }, `Reserved for ${si}`, `${l.kg.toLocaleString()} kg`);
      moves.push(lotMove({ lotId: l.lotId, kind: 'RESERVE', kg: 0, bags: Math.round(l.kg / lot.kgPerBag), ref: si, note: `${l.kg.toLocaleString()} kg reserved` }));
    }
    commit({ ...s, lots, lotMoves: [...moves, ...s.lotMoves] });
    return { ok: true };
  };
  const releaseLots = (si: string): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    const mine = s.lots.filter((l) => l.reservedFor === si && l.reservedKg > 0);
    let lots = s.lots;
    for (const l of mine) lots = patchLot(lots, l.id, { reservedKg: 0, reservedFor: undefined }, `Reservation for ${si} released`);
    commit({ ...s, lots, lotMoves: [...mine.map((l) => lotMove({ lotId: l.id, kind: 'UNRESERVE', kg: 0, bags: 0, ref: si, note: `${l.reservedKg.toLocaleString()} kg released` })), ...s.lotMoves] });
    return { ok: true };
  };

  /* ================= Inbound: ASN, tally sheet, yard ================= */
  const createAsn = (a: { source: Asn['source']; from: string; owner: string; ownership: Ownership; warehouseId: string; expected: string; truck: string; saleNo?: string; lines: AsnLine[] }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Advance shipping notices are logged by Operations');
    if (g) return fail(g);
    const lines = a.lines.filter((l) => l.invoiceNo.trim() && l.bags > 0);
    if (!a.from.trim() || !a.truck.trim()) return fail('Enter who is sending the tea and the truck registration');
    if (!lines.length) return fail('Add at least one invoice line with bags');
    if (lines.some((l) => !(l.kgPerBag > 0) || !l.grade.trim() || !l.garden.trim())) return fail('Every line needs a garden, grade and kg per bag');
    const dupe = lines.find((l) => s.lots.some((x) => x.invoiceNo === l.invoiceNo.trim() && x.garden === l.garden.trim()));
    if (dupe) return fail(`Invoice ${dupe.invoiceNo} from ${dupe.garden} is already in stock`);
    const { number, sequence } = next(s, 'ASN');
    const id = uid('asn');
    commit({ ...s, sequence, asns: [{ ...a, id, number, lines, status: 'EXPECTED', history: [log('Advance notice received')] }, ...s.asns] });
    return done('ASN logged', `${number}: ${lines.reduce((x, l) => x + l.bags, 0)} bags expected ${a.expected}`, id);
  };
  const asnArrived = (id: string, slot: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'The gate is run by Stores and Operations');
    if (g) return fail(g);
    const a = s.asns.find((x) => x.id === id)!;
    if (a.status !== 'EXPECTED') return fail('This delivery has already arrived');
    if (!slot.trim()) return fail('Choose a yard slot or dock');
    if (s.yard.some((y) => y.slot === slot && y.status !== 'LEFT')) return fail(`${slot} is occupied`);
    const visit: YardVisit = { id: uid('yd'), truck: a.truck, haulier: a.from, purpose: 'DELIVERY', ref: a.number, gateIn: now(), slot, status: slot.startsWith('Dock') ? 'AT_DOCK' : 'IN_YARD' };
    commit(withTask({ ...s, yard: [visit, ...s.yard], asns: s.asns.map((x) => (x.id === id ? { ...x, status: 'ARRIVED', arrivedAt: now(), history: [...x.history, log('Truck arrived at the gate', slot)] } : x)) }, 'RECEIVE', a.number, a.warehouseId, `Receive ${a.from} — ${a.lines.reduce((x, l) => x + l.bags, 0)} bags`));
    return done('Gate in', `${a.truck} at ${slot}`);
  };
  /** Receive against the ASN: count bags, weigh, sign the inward tally sheet; lots go to QC and put-away. */
  const receiveAsn = (id: string, tally: TallyLine[], signature?: Signature): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores receives tea — switch to John Kiprop');
    if (g) return fail(g);
    const a = s.asns.find((x) => x.id === id)!;
    if (a.status !== 'ARRIVED') return fail(a.status === 'EXPECTED' ? 'Gate the truck in first' : 'Already received');
    if (tally.length !== a.lines.length || tally.some((t) => !(t.bagsCounted >= 0) || !(t.weighedKg > 0))) return fail('Count the bags and weigh every invoice line');
    let nx: WarehouseExtState = { ...s };
    const { number: tallyNo, sequence } = next(s, 'TLY');
    nx.sequence = sequence;
    const newLots: TeaLot[] = [];
    const newHus: HandlingUnit[] = [];
    const moves: LotMove[] = [];
    const variances: string[] = [];
    a.lines.forEach((l, i) => {
      const t = tally[i];
      const declaredKg = l.bags * l.kgPerBag;
      const slot = suggestSlot(nx, a.warehouseId, l.grade, t.weighedKg);
      const lotId = uid('lot');
      const lotNo = `L-${String(24_100 + (nx.sequence.LOT ?? 0) + i)}`;
      if (Math.abs(t.weighedKg - declaredKg) / declaredKg > 0.005) variances.push(`${l.invoiceNo}: ${round2(t.weighedKg - declaredKg)} kg`);
      if (t.bagsCounted !== l.bags) variances.push(`${l.invoiceNo}: ${t.bagsCounted} bags counted, ${l.bags} expected`);
      newLots.push({
        id: lotId,
        lotNo,
        garden: l.garden,
        mark: l.mark || l.garden.toUpperCase(),
        grade: l.grade,
        invoiceNo: l.invoiceNo,
        saleNo: a.saleNo,
        season: `${TODAY.slice(0, 4)}/${Number(TODAY.slice(2, 4)) + 1}`,
        origin: 'Kenya',
        owner: a.owner,
        ownership: a.ownership,
        warehouseId: a.warehouseId,
        locationId: slot?.id,
        arrival: TODAY,
        expiry: addDays(TODAY, 730),
        bags: t.bagsCounted,
        kgPerBag: l.kgPerBag,
        netKg: t.weighedKg,
        declaredKg,
        weighedKg: t.weighedKg,
        costPerKg: l.costPerKg,
        qc: 'PENDING',
        reservedKg: 0,
        status: 'IN_STOCK',
        asnId: a.id,
        rfid: `E200-3412-${uid('').slice(-4).toUpperCase()}`,
        attributes: { Grade: l.grade, Garden: l.garden },
        history: [log('Received', `${tallyNo} · ${t.bagsCounted} bags · ${t.weighedKg.toLocaleString()} kg (${t.source === 'SCALE' ? 'weigh scale' : 'manual'})`)]
      } as TeaLot);
      let left = t.bagsCounted;
      let hu = nx.sequence.HU ?? 0;
      while (left > 0) {
        const bags = Math.min(20, left);
        left -= bags;
        hu++;
        newHus.push({ id: uid('hu'), code: `HU${100_000 + hu}`, lotId, bags, kg: round2((bags * t.weighedKg) / Math.max(1, t.bagsCounted)), locationId: slot?.id, status: 'STORED', rfid: `E280-1160-${String(hu).padStart(6, '0')}` });
      }
      nx.sequence = { ...nx.sequence, HU: hu };
      moves.push(lotMove({ lotId, kind: 'RECEIPT', kg: t.weighedKg, bags: t.bagsCounted, to: a.warehouseId, ref: tallyNo }));
      nx.lots = [...newLots.slice(-1), ...nx.lots];
    });
    nx.sequence = { ...nx.sequence, LOT: (nx.sequence.LOT ?? 0) + a.lines.length };
    nx = {
      ...nx,
      lots: [...newLots, ...s.lots],
      hus: [...newHus, ...s.hus],
      lotMoves: [...moves, ...s.lotMoves],
      asns: s.asns.map((x) => (x.id === id ? { ...x, status: 'RECEIVED', tally: { number: tallyNo, by: actor.name, at: TODAY, lines: tally, signature }, history: [...x.history, log(`Received — inward tally ${tallyNo}`, variances.join('; ') || undefined)] } : x)),
      tasks: s.tasks.map((t) => (t.ref === a.number && t.type === 'RECEIVE' && t.status !== 'DONE' ? { ...t, status: 'DONE', doneAt: TODAY } : t))
    };
    for (const l of newLots) {
      nx = withTask(nx, 'QC', l.lotNo, a.warehouseId, `Quality check ${l.garden} ${l.grade} (${l.invoiceNo})`);
      const loc = nx.locations.find((x) => x.id === l.locationId);
      nx = withTask(nx, 'PUTAWAY', l.lotNo, a.warehouseId, `Put away ${l.lotNo} to ${loc ? `${loc.block}-${loc.bay}-${loc.row}` : 'a free slot'}`);
    }
    commit(nx);
    if (variances.length) notify({ module: 'Warehousing', to: 'Trading & Operations Manager', subject: `Weight / count variance on ${a.number}`, body: variances.join('\n'), ref: tallyNo, level: 'warning' });
    notify({ module: 'Warehousing', to: a.owner === 'OWN' ? 'Trading' : partyName(a.owner), subject: `Tea arrival advice ${tallyNo}`, body: `${newLots.length} invoice(s), ${newLots.reduce((x, l) => x + l.bags, 0)} bags, ${round2(newLots.reduce((x, l) => x + l.netKg, 0)).toLocaleString()} kg received at ${whName(a.warehouseId)}.`, ref: tallyNo });
    return done('Tea received', `${tallyNo}: ${newLots.length} lots to QC and put-away${variances.length ? ` · ${variances.length} variance(s)` : ''}`, tallyNo);
  };
  const cancelAsn = (id: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Operations cancels advance notices');
    if (g) return fail(g);
    const a = s.asns.find((x) => x.id === id)!;
    if (a.status !== 'EXPECTED') return fail('Only expected deliveries can be cancelled');
    commit({ ...s, asns: s.asns.map((x) => (x.id === id ? { ...x, status: 'CANCELLED', history: [...x.history, log('Cancelled')] } : x)) });
    return done('ASN cancelled', a.number);
  };
  const gateIn = (v: Omit<YardVisit, 'id' | 'gateIn' | 'status'>): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'The gate is run by Stores and Operations');
    if (g) return fail(g);
    if (!v.truck.trim() || !v.haulier.trim() || !v.slot) return fail('Enter the truck, haulier and slot');
    if (v.container && !/^[A-Z]{4}\s?\d{7}$/.test(v.container.trim().toUpperCase())) return fail('Container numbers look like MSKU 1234567');
    if (s.yard.some((y) => y.status !== 'LEFT' && y.truck.replace(/\s/g, '') === v.truck.replace(/\s/g, '').toUpperCase())) return fail(`${v.truck} is already in the yard`);
    if (s.yard.some((y) => y.slot === v.slot && y.status !== 'LEFT')) return fail(`${v.slot} is occupied`);
    commit({ ...s, yard: [{ ...v, truck: v.truck.toUpperCase(), container: v.container?.toUpperCase() || undefined, id: uid('yd'), gateIn: now(), status: v.slot.startsWith('Dock') ? 'AT_DOCK' : 'IN_YARD' }, ...s.yard] });
    return done('Gate in', `${v.truck.toUpperCase()} → ${v.slot}`);
  };
  const moveInYard = (id: string, slot: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'The yard is run by Stores and Operations');
    if (g) return fail(g);
    const v = s.yard.find((x) => x.id === id)!;
    if (v.status === 'LEFT') return fail('The truck has left');
    if (s.yard.some((y) => y.id !== id && y.slot === slot && y.status !== 'LEFT')) return fail(`${slot} is occupied`);
    commit({ ...s, yard: s.yard.map((x) => (x.id === id ? { ...x, slot, status: slot.startsWith('Dock') ? 'AT_DOCK' : 'IN_YARD' } : x)) });
    return done('Moved', `${v.truck} → ${slot}`);
  };
  const gateOut = (id: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'The gate is run by Stores and Operations');
    if (g) return fail(g);
    const v = s.yard.find((x) => x.id === id)!;
    if (v.status === 'LEFT') return fail('Already gated out');
    const asn = s.asns.find((a) => a.number === v.ref);
    if (asn && asn.status === 'ARRIVED') return fail(`Receive ${asn.number} before the truck leaves`);
    commit({ ...s, yard: s.yard.map((x) => (x.id === id ? { ...x, gateOut: now(), status: 'LEFT' } : x)) });
    return done('Gate out', v.truck);
  };

  /* ================= Tasks ================= */
  const autoAssign = (): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores or the Operations Manager assigns work');
    if (g) return fail(g);
    const { tasks, made } = assignTasks(s.tasks, s.workers);
    if (!made.length) return fail('Nothing to assign — every open task has someone, or nobody qualified has free time');
    commit({ ...s, tasks });
    return done('Tasks assigned', made.map((m) => `${m.task} → ${m.to}`).join(', '));
  };
  const setTask = (id: string, patch: Partial<WarehouseTask>): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores or the Operations Manager updates tasks');
    if (g) return fail(g);
    const t = s.tasks.find((x) => x.id === id)!;
    if (t.status === 'DONE') return fail('This task is finished');
    if (patch.status === 'IN_PROGRESS' && !t.assignee && !patch.assignee) return fail('Assign the task first');
    if (patch.assignee && !s.workers.find((w) => w.name === patch.assignee)?.skills.includes(t.type)) return fail(`${patch.assignee} is not trained for ${t.type.toLowerCase()} tasks`);
    commit({ ...s, tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...patch, doneAt: patch.status === 'DONE' ? TODAY : x.doneAt } : x)) });
    return { ok: true };
  };
  const addTask = (type: TaskType, warehouseId: string, refNo: string, detail: string): Result => {
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'Operations raises warehouse tasks');
    if (g) return fail(g);
    if (!detail.trim()) return fail('Describe the task');
    commit(withTask(ref.current, type, refNo || '—', warehouseId, detail));
    return done('Task added', detail);
  };

  /* ================= Cycle counts and handling-unit counts ================= */
  const saveCountPlan = (p: { id?: string; warehouseId: string; type: 'ANNUAL' | 'CYCLE'; abc: 'A' | 'B' | 'C' | 'ALL'; everyDays: number }): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Count plans are set by the Operations Manager');
    if (g) return fail(g);
    if (!(p.everyDays >= 1)) return fail('Frequency must be at least one day');
    if (p.type === 'ANNUAL' && p.everyDays < 300) return fail('An annual count runs at most once a year');
    if (!p.id && s.countPlans.some((x) => x.warehouseId === p.warehouseId && x.type === p.type && x.abc === p.abc)) return fail('That plan already exists for this warehouse');
    commit({ ...s, countPlans: p.id ? s.countPlans.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id } : x)) : [...s.countPlans, { ...p, id: uid('cp'), lastDone: addDays(TODAY, -p.everyDays) }] });
    return done('Count plan saved', `${p.type === 'ANNUAL' ? 'Annual' : `Cycle (${p.abc})`} every ${p.everyDays} days`);
  };
  /** Starts a blind handling-unit count for the plan's scope (class A/B/C lots or everything). */
  const startHuCount = (planId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores runs counts — switch to John Kiprop');
    if (g) return fail(g);
    const p = s.countPlans.find((x) => x.id === planId)!;
    if (s.huCounts.some((c) => c.warehouseId === p.warehouseId && c.status !== 'APPROVED')) return fail('A handling-unit count is already open for this warehouse');
    const lots = s.lots.filter((l) => l.warehouseId === p.warehouseId && l.status === 'IN_STOCK');
    const abc = abcClasses(lots);
    const scope = new Set(lots.filter((l) => p.abc === 'ALL' || abc[l.id] === p.abc).map((l) => l.id));
    const expected = s.hus.filter((h) => scope.has(h.lotId) && h.status === 'STORED').map((h) => h.id);
    if (!expected.length) return fail('No handling units in scope');
    const { number, sequence } = next(s, 'HUC');
    commit({
      ...s,
      sequence,
      countPlans: s.countPlans.map((x) => (x.id === planId ? { ...x, lastDone: TODAY } : x)),
      huCounts: [{ id: uid('huc'), number, warehouseId: p.warehouseId, expected, scanned: [], status: 'OPEN', history: [log(`${p.type === 'ANNUAL' ? 'Annual' : `Cycle (${p.abc})`} count started`, `${expected.length} handling units`)] }, ...s.huCounts]
    });
    return done('Count started', `${number}: scan ${expected.length} handling units`, number);
  };
  /** Scan a handling unit by barcode or RFID tag. */
  const scanHu = (countId: string, code: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores scans the count');
    if (g) return fail(g);
    const c = s.huCounts.find((x) => x.id === countId)!;
    if (c.status !== 'OPEN') return fail('This count is closed');
    const k = code.trim().toUpperCase();
    const hu = s.hus.find((h) => h.code === k || h.rfid.toUpperCase() === k);
    if (!hu) return fail(`No handling unit with code or tag ${code}`);
    if (c.scanned.includes(hu.id)) return fail(`${hu.code} was already scanned`);
    commit({ ...s, huCounts: s.huCounts.map((x) => (x.id === countId ? { ...x, scanned: [...x.scanned, hu.id] } : x)) });
    return { ok: true, id: hu.code };
  };
  const submitHuCount = (countId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores submits the count');
    if (g) return fail(g);
    const c = s.huCounts.find((x) => x.id === countId)!;
    if (c.status !== 'OPEN') return fail('Already submitted');
    if (!c.scanned.length) return fail('Scan at least one handling unit');
    commit({ ...s, huCounts: s.huCounts.map((x) => (x.id === countId ? { ...x, status: 'SUBMITTED', countedBy: actor.name, history: [...x.history, log('Count submitted', `${x.scanned.length}/${x.expected.length} found`)] } : x)) });
    return done('Count submitted', 'The Operations Manager approves missing units');
  };
  const approveHuCount = (countId: string, note: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Count differences are approved by the Operations Manager');
    if (g) return fail(g);
    const c = s.huCounts.find((x) => x.id === countId)!;
    if (c.status !== 'SUBMITTED') return fail('Only submitted counts can be approved');
    if (c.countedBy === actor.name) return fail('You counted this stock, so someone else must approve it');
    const missing = c.expected.filter((x) => !c.scanned.includes(x));
    if (missing.length && !note.trim()) return fail('Explain the missing handling units');
    let lots = s.lots;
    const moves: LotMove[] = [];
    for (const id of missing) {
      const hu = s.hus.find((h) => h.id === id)!;
      const lot = lots.find((l) => l.id === hu.lotId)!;
      const left = round2(lot.netKg - hu.kg);
      lots = patchLot(lots, lot.id, { netKg: left, bags: Math.max(0, lot.bags - hu.bags), reservedKg: Math.min(lot.reservedKg, Math.max(0, left)), status: left <= 0 ? 'DEPLETED' : lot.status }, `Count adjustment — ${hu.code} missing`, note);
      moves.push(lotMove({ lotId: lot.id, huId: id, kind: 'COUNT', kg: -hu.kg, bags: -hu.bags, from: lot.warehouseId, ref: c.number, note }));
    }
    commit({
      ...s,
      lots,
      hus: s.hus.map((h) => (missing.includes(h.id) ? { ...h, status: 'MISSING' } : h)),
      lotMoves: [...moves, ...s.lotMoves],
      huCounts: s.huCounts.map((x) => (x.id === countId ? { ...x, status: 'APPROVED', approvedBy: actor.name, history: [...x.history, log(missing.length ? `${missing.length} missing units written off` : 'Approved — all units found', note || undefined)] } : x))
    });
    return done('Count approved', missing.length ? `${missing.length} handling units written off` : 'Everything found');
  };

  /* ================= Pick, pack and load ================= */
  /** Pick list for a confirmed SI, first-expiry-first-out, with the slot to pick from. */
  const createPickList = (siId: string, siNumber: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Operations releases pick lists');
    if (g) return fail(g);
    if (s.pickLists.some((p) => p.siId === siId)) return fail('A pick list already exists for this instruction');
    const lots = fefo(s.lots.filter((l) => l.reservedFor === siNumber && l.reservedKg > 0));
    if (!lots.length) return fail('Nothing is reserved for this instruction — confirm it first');
    const { number, sequence } = next(s, 'PCK');
    const lines = lots.map((l) => ({ lotId: l.id, locationId: l.locationId, bags: Math.round(l.reservedKg / l.kgPerBag), kg: l.reservedKg, picked: false }));
    let nx: WarehouseExtState = { ...s, sequence, pickLists: [{ id: uid('pk'), number, siId, siNumber, warehouseId: lots[0].warehouseId, lines, status: 'OPEN', history: [log('Pick list released', `${lines.length} lots, FEFO`)] }, ...s.pickLists] };
    nx = withTask(nx, 'PICK', number, lots[0].warehouseId, `Pick ${lines.reduce((x, l) => x + l.bags, 0)} bags for ${siNumber}`);
    commit(nx);
    return done('Pick list released', `${number}: ${lines.length} lots`, number);
  };
  const confirmPick = (listId: string, lotId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores confirms picks — switch to John Kiprop');
    if (g) return fail(g);
    const p = s.pickLists.find((x) => x.id === listId)!;
    if (p.status !== 'OPEN') return fail('This pick list is complete');
    const line = p.lines.find((l) => l.lotId === lotId)!;
    if (line.picked) return fail('Already picked');
    const lot = lotOf(lotId)!;
    if (lot.qc !== 'PASS') return fail(`${lot.lotNo} is ${lot.qc.toLowerCase()} — it cannot be picked`);
    const lines = p.lines.map((l) => (l.lotId === lotId ? { ...l, picked: true } : l));
    const all = lines.every((l) => l.picked);
    let left = line.bags;
    commit({
      ...s,
      hus: s.hus.map((h) => {
        if (h.lotId !== lotId || h.status !== 'STORED' || left <= 0) return h;
        left -= h.bags;
        return { ...h, status: 'PICKED' };
      }),
      lotMoves: [lotMove({ lotId, kind: 'PICK', kg: 0, bags: line.bags, from: line.locationId, to: 'Stuffing bay', ref: p.number }), ...s.lotMoves],
      pickLists: s.pickLists.map((x) => (x.id === listId ? { ...x, lines, status: all ? 'PICKED' : 'OPEN', history: [...x.history, log(`Picked ${lot.lotNo}`, `${line.bags} bags`)] } : x)),
      tasks: all ? s.tasks.map((t) => (t.ref === p.number && t.status !== 'DONE' ? { ...t, status: 'DONE', doneAt: TODAY } : t)) : s.tasks
    });
    return done('Picked', `${lot.lotNo}${all ? ' — pick list complete' : ''}`);
  };
  const packList = (listId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores packs and marks the bags');
    if (g) return fail(g);
    const p = s.pickLists.find((x) => x.id === listId)!;
    if (p.status !== 'PICKED') return fail('Pick every line first');
    commit({ ...s, pickLists: s.pickLists.map((x) => (x.id === listId ? { ...x, status: 'PACKED', history: [...x.history, log('Packed and marked — ready to stuff')] } : x)) });
    return done('Packed', p.number);
  };
  const createLoadingPlan = (p: { ref: string; shipmentId?: string; siId?: string; containerType: ContainerType; warehouseId: string; lotIds: string[]; reservedFor?: string }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Operations prepares loading plans');
    if (g) return fail(g);
    if (!p.lotIds.length) return fail('Choose the lots to load');
    if (p.shipmentId && s.loadingPlans.some((x) => x.shipmentId === p.shipmentId && x.status === 'DRAFT')) return fail('This shipment already has a draft loading plan');
    const lots = p.lotIds.map((id) => lotOf(id)!).filter(Boolean);
    const wrongSite = lots.find((l) => l.warehouseId !== p.warehouseId);
    if (wrongSite) return fail(`${wrongSite.lotNo} is at ${whName(wrongSite.warehouseId)} — transfer it to the stuffing base first`);
    const held = lots.find((l) => l.qc !== 'PASS');
    if (held) return fail(`${held.lotNo} is ${held.qc.toLowerCase()} by QC and cannot be loaded`);
    const cands = lots.map((l) => {
      const kg = p.reservedFor ? (l.reservedFor === p.reservedFor ? l.reservedKg : 0) : availableKg(l);
      return { lotId: l.id, kg, bags: Math.round(kg / l.kgPerBag) };
    });
    const plan = planContainer(cands, p.containerType);
    if (!plan.lines.length) return fail('Nothing on those lots can be loaded');
    const { number, sequence } = next(s, 'LP');
    commit({
      ...s,
      sequence,
      loadingPlans: [
        { id: uid('lp'), number, ref: p.ref, shipmentId: p.shipmentId, siId: p.siId, containerType: p.containerType, container: '', seal: '', warehouseId: p.warehouseId, lines: plan.lines, tareKg: CONTAINER_SPEC[p.containerType].tareKg, dunnageKg: 120, status: 'DRAFT', history: [log('Loading plan prepared', `${plan.bags} bags · ${plan.kg.toLocaleString()} kg · ${Math.round(plan.fillKg * 100)}% of payload`)] },
        ...s.loadingPlans
      ]
    });
    if (plan.left > 0) addToast({ type: 'warning', title: 'Does not all fit', message: `${plan.left} bags left over — plan a second container` });
    return done('Loading plan prepared', `${number}: ${plan.bags} bags in a ${p.containerType}`, number);
  };
  const updatePlan = (planId: string, patch: { container?: string; seal?: string; tareKg?: number; dunnageKg?: number }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Operations updates loading plans');
    if (g) return fail(g);
    const p = s.loadingPlans.find((x) => x.id === planId)!;
    if (p.status !== 'DRAFT') return fail('The container is already stuffed');
    if (patch.container !== undefined && patch.container && !/^[A-Z]{4}\s?\d{7}$/.test(patch.container.trim().toUpperCase())) return fail('Container numbers look like MSKU 1234567');
    if (patch.tareKg !== undefined && !(patch.tareKg > 1_500 && patch.tareKg < 5_000)) return fail('Tare must be between 1,500 and 5,000 kg');
    commit({ ...s, loadingPlans: s.loadingPlans.map((x) => (x.id === planId ? { ...x, ...patch, container: patch.container?.trim().toUpperCase() ?? x.container, vgm: undefined } : x)) });
    return done('Plan updated', p.number);
  };
  /** Verified gross mass: method 1 weighs the packed container (simulated weighbridge); method 2 adds up cargo, dunnage and tare. */
  const certifyVgm = (planId: string, method: 'METHOD_1' | 'METHOD_2', weighbridgeKg: number | null, scaleRef: string, signature?: Signature): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores certifies the VGM — switch to John Kiprop');
    if (g) return fail(g);
    const p = s.loadingPlans.find((x) => x.id === planId)!;
    if (!p.container) return fail('Record the container number first');
    if (!signature) return fail('The VGM must be signed by the shipper’s authorised person');
    const calc = vgmMethod2(p.lines, p.tareKg, p.dunnageKg);
    const gross = method === 'METHOD_1' ? (weighbridgeKg ?? 0) : calc;
    if (!(gross > 0)) return fail('Read the weighbridge first');
    if (method === 'METHOD_1' && Math.abs(gross - calc) / calc > 0.05) return fail(`Weighbridge ${gross.toLocaleString()} kg is more than 5% off the declared ${calc.toLocaleString()} kg — re-weigh or check the load`);
    if (!scaleRef.trim()) return fail('Enter the weighbridge ticket or calculation reference');
    const { number, sequence } = next(s, 'VGM');
    commit({ ...s, sequence, loadingPlans: s.loadingPlans.map((x) => (x.id === planId ? { ...x, vgm: { number, method, grossKg: gross, weighedBy: actor.name, scaleRef, at: now(), signature }, history: [...x.history, log(`VGM ${number} certified`, `${gross.toLocaleString()} kg (${method === 'METHOD_1' ? 'method 1' : 'method 2'})`)] } : x)) });
    return done('VGM certified', `${number}: ${gross.toLocaleString()} kg`, number);
  };
  /** Stuff the container: lots leave stock, the shipment gets its container, seal and VGM. */
  const stuffContainer = (planId: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores stuffs and seals the container — switch to John Kiprop');
    if (g) return fail(g);
    const p = s.loadingPlans.find((x) => x.id === planId)!;
    if (p.status !== 'DRAFT') return fail('Already stuffed');
    if (!p.container || !p.seal.trim()) return fail('Record the container and seal numbers');
    if (!p.vgm) return fail('Certify the verified gross mass (VGM) first');
    if (p.siId && s.pickLists.find((x) => x.siId === p.siId)?.status !== 'PACKED') return fail('Pick and pack the instruction’s tea first');
    for (const l of p.lines) {
      const lot = lotOf(l.lotId)!;
      if (lot.netKg < l.kg - 0.01) return fail(`${lot.lotNo} has only ${lot.netKg.toLocaleString()} kg left`);
      if (lot.qc !== 'PASS') return fail(`${lot.lotNo} is ${lot.qc.toLowerCase()} by QC`);
    }
    if (p.shipmentId) {
      const sh = ops.state.shipments.find((x) => x.id === p.shipmentId);
      if (sh?.blocked) return fail(`Shipment ${sh.number} is blocked: ${sh.blocked.reason}`);
      const r1 = ops.linkLoadingPlan(p.shipmentId, p.number, p.container, p.seal);
      if (!r1.ok) return r1;
      const r2 = ops.recordVgm(p.shipmentId, { grossKg: p.vgm.grossKg, method: p.vgm.method });
      if (!r2.ok) return r2;
    }
    let lots = s.lots;
    const moves: LotMove[] = [];
    for (const l of p.lines) {
      const lot = lots.find((x) => x.id === l.lotId)!;
      const left = round2(lot.netKg - l.kg);
      lots = patchLot(lots, lot.id, { netKg: left, bags: Math.max(0, lot.bags - l.bags), reservedKg: Math.max(0, round2(lot.reservedKg - l.kg)), reservedFor: lot.reservedKg - l.kg > 0.01 ? lot.reservedFor : undefined, status: left <= 0.01 ? 'DEPLETED' : 'IN_STOCK' }, `Loaded into ${p.container}`, `${l.bags} bags · ${p.number}`);
      moves.push(lotMove({ lotId: lot.id, kind: 'LOAD', kg: -l.kg, bags: -l.bags, from: lot.warehouseId, to: p.container, ref: p.number }));
    }
    const loadedLots = new Set(p.lines.map((l) => l.lotId));
    commit({
      ...ref.current,
      lots,
      hus: ref.current.hus.map((h) => (loadedLots.has(h.lotId) && (h.status === 'PICKED' || h.status === 'STORED') ? { ...h, status: 'LOADED' } : h)),
      lotMoves: [...moves, ...ref.current.lotMoves],
      loadingPlans: ref.current.loadingPlans.map((x) => (x.id === planId ? { ...x, status: 'STUFFED', stuffedBy: actor.name, stuffedAt: TODAY, history: [...x.history, log('Container stuffed and sealed', `${p.container} · seal ${p.seal}`)] } : x))
    });
    notify({ module: 'Warehousing', to: 'Shipping, Finance & Trading', subject: `Container ${p.container} stuffed (${p.ref})`, body: `${p.lines.reduce((x, l) => x + l.bags, 0)} bags, VGM ${p.vgm.grossKg.toLocaleString()} kg, seal ${p.seal}.`, ref: p.ref });
    return done('Container stuffed', `${p.container} sealed · ${p.lines.length} lots out of stock`);
  };

  /* ================= Outbound proof of delivery ================= */
  const recordPod = (deliveryId: string, receivedBy: string, signature: Signature, remarks: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'OFFICER', 'MANAGER'], 'Dispatch records proof of delivery');
    if (g) return fail(g);
    const dl = commercial.state.deliveries.find((x) => x.id === deliveryId);
    if (!dl) return fail('Unknown delivery');
    if (s.pods.some((p) => p.deliveryId === deliveryId)) return fail('Proof of delivery is already on file');
    if (!receivedBy.trim()) return fail('Who signed for the goods?');
    if (dl.status !== 'DELIVERED') {
      const r = commercial.confirmDelivery(deliveryId, receivedBy);
      if (!r.ok) return r;
    }
    const trip = ops.state.trips.find((t) => t.deliveryRef === dl.number);
    commit({ ...s, pods: [{ deliveryId, deliveryNumber: dl.number, tripNumber: trip?.number, receivedBy, at: now(), signature, remarks: remarks || undefined }, ...s.pods] });
    return done('Proof of delivery signed', `${dl.number} — ${receivedBy}`);
  };

  /* ================= Returns (RMA) ================= */
  const createRma = (r: { customerId: string; deliveryRef: string; lines: { sku: string; qty: number; price: number }[]; reason: string; warehouseId: string }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Returns are authorised by the Operations Officer or Manager');
    if (g) return fail(g);
    const lines = r.lines.filter((l) => l.sku && l.qty > 0);
    if (!r.customerId || !r.deliveryRef) return fail('Choose the customer and the delivery being returned');
    if (!lines.length) return fail('Add the items being returned');
    if (!r.reason.trim()) return fail('Give the reason for the return');
    const dl = commercial.state.deliveries.find((x) => x.number === r.deliveryRef);
    if (dl) {
      const order = commercial.state.orders.find((o) => o.id === dl.orderId);
      for (const l of lines) {
        const sent = dl.lines.filter((x) => order?.lines.find((ol) => ol.id === x.lineId)?.sku === l.sku).reduce((a, x) => a + x.qty, 0);
        const already = s.returns.filter((x) => x.deliveryRef === r.deliveryRef && x.status !== 'REJECTED').reduce((a, x) => a + x.lines.filter((y) => y.sku === l.sku).reduce((b, y) => b + y.qty, 0), 0);
        if (l.qty + already > sent) return fail(`Only ${sent - already} of ${l.sku} on ${dl.number} can still be returned`);
      }
    }
    const { number, sequence } = next(s, 'RMA');
    commit({ ...s, sequence, returns: [{ ...r, lines, id: uid('rma'), number, status: 'AUTHORISED', history: [log('Return authorised', r.reason)] }, ...s.returns] });
    notify({ module: 'Warehousing', to: partyName(r.customerId), subject: `Return authorisation ${number}`, body: `Please quote ${number} on the returned goods (${r.deliveryRef}).`, ref: number });
    return done('RMA issued', number, number);
  };
  const receiveReturn = (id: string, qtys: number[]): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores receives returns — switch to John Kiprop');
    if (g) return fail(g);
    const r = s.returns.find((x) => x.id === id)!;
    if (r.status !== 'AUTHORISED') return fail('Only authorised returns can be received');
    if (qtys.some((q, i) => q < 0 || q > r.lines[i].qty)) return fail('Received quantity cannot exceed what was authorised');
    if (!qtys.some((q) => q > 0)) return fail('Enter what arrived');
    const res = commercial.adjustStock(r.lines.map((l, i) => ({ sku: l.sku, delta: qtys[i] })).filter((x) => x.delta > 0));
    if (!res.ok) return res;
    const lines = r.lines.map((l, i) => ({ ...l, qty: qtys[i] }));
    commit({ ...s, returns: s.returns.map((x) => (x.id === id ? { ...x, lines, status: 'RECEIVED', receivedQty: qtys.reduce((a, b) => a + b, 0), history: [...x.history, log('Goods received back into stock', lines.map((l) => `${l.qty} × ${l.sku}`).join(', '))] } : x)) });
    return done('Return received', `${r.number} back in stock`);
  };
  /** Customer credit: a draft journal for Finance (Dr sales returns, Cr customer credit due) plus a notice to raise the credit note. */
  const creditReturn = (id: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Customer credits are approved by the Operations Manager');
    if (g) return fail(g);
    const r = s.returns.find((x) => x.id === id)!;
    if (r.status !== 'RECEIVED') return fail('Receive the goods before crediting the customer');
    const amount = round2(r.lines.reduce((x, l) => x + l.qty * l.price, 0));
    if (!(amount > 0)) return fail('Nothing to credit');
    const j = finance.saveJournal({
      date: TODAY,
      memo: `Customer credit for ${r.number} (${partyName(r.customerId)}, ${r.deliveryRef})`,
      lines: [
        { id: uid('jl'), account: '4000', description: `Sales returns — ${r.number}`, debit: amount, credit: 0, department: 'Sales' },
        { id: uid('jl'), account: '2200', description: `Credit due to ${partyName(r.customerId)} — ${r.number}`, debit: 0, credit: amount, department: 'Sales' }
      ]
    });
    if (!j.ok) return j;
    const jn = finance.snapshot().journals.find((x) => x.id === j.id)?.number ?? j.id ?? '';
    commit({ ...s, returns: s.returns.map((x) => (x.id === id ? { ...x, status: 'CREDITED', creditRef: jn, history: [...x.history, log(`Credit journal ${jn} raised in Finance`, amount.toLocaleString())] } : x)) });
    notify({ module: 'Finance', to: 'Finance — accounts receivable', subject: `Credit ${partyName(r.customerId)} for ${r.number}`, body: `KES ${amount.toLocaleString()} — journal ${jn} awaits approval.`, ref: r.number });
    return done('Customer credit raised', `${jn} · KES ${amount.toLocaleString()}`);
  };
  const rejectReturn = (id: string, note: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER', 'OFFICER'], 'Operations rejects returns');
    if (g) return fail(g);
    const r = s.returns.find((x) => x.id === id)!;
    if (r.status !== 'AUTHORISED') return fail('Only open authorisations can be rejected');
    if (!note.trim()) return fail('Say why');
    commit({ ...s, returns: s.returns.map((x) => (x.id === id ? { ...x, status: 'REJECTED', history: [...x.history, log('Rejected', note)] } : x)) });
    return done('Return rejected', r.number);
  };

  /* ================= Transport ================= */
  const createLoad = (l: { lane: string; date: string; refs: string[]; kg: number }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Loads are planned by the Operations Officer or Manager');
    if (g) return fail(g);
    if (!l.lane || !l.date) return fail('Choose the lane and date');
    if (!(l.kg > 0)) return fail('Enter the weight to move');
    if (l.date < TODAY) return fail('The pick-up date is in the past');
    const { number, sequence } = next(s, 'LD');
    const id = uid('ld');
    commit({ ...s, sequence, loads: [{ id, number, lane: l.lane, date: l.date, refs: l.refs, kg: l.kg, cost: 0, status: 'PLANNED', plannedPickup: l.date, plannedDelivery: addDays(l.date, l.lane.includes('Kampala') ? 4 : 2), history: [log('Load planned', l.refs.join(', ') || undefined)] }, ...s.loads] });
    return done('Load planned', `${number}: ${l.kg.toLocaleString()} kg ${l.lane}`, id);
  };
  const tenderLoad = (id: string, carrierId: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Carriers are assigned by the Operations Officer or Manager');
    if (g) return fail(g);
    const l = s.loads.find((x) => x.id === id)!;
    if (l.status !== 'PLANNED') return fail('This load is already tendered');
    const c = s.carriers.find((x) => x.id === carrierId)!;
    const rate = c.rates.find((r) => r.lane === l.lane);
    if (!rate) return fail(`${c.name} does not serve ${l.lane}`);
    const cost = round2(Math.max(rate.minCharge, rate.perKg * l.kg));
    commit({ ...s, loads: s.loads.map((x) => (x.id === id ? { ...x, carrierId, vehicleId: undefined, cost, status: 'TENDERED', tracking: c.api ? `${c.name.slice(0, 3).toUpperCase()}${Date.now().toString().slice(-9)}` : undefined, history: [...x.history, log(`Tendered to ${c.name}`, `KES ${cost.toLocaleString()}`)] } : x)) });
    notify({ module: 'Transport', to: c.name, subject: `Load tender ${l.number}`, body: `${l.kg.toLocaleString()} kg ${l.lane}, pick-up ${l.date}. Agreed rate KES ${cost.toLocaleString()}.`, ref: l.number, channels: ['EMAIL', 'SMS'] });
    return done('Load tendered', `${l.number} → ${c.name}`);
  };
  /** Use our own truck instead: starts a fleet trip if the vehicle can carry the weight. */
  const assignOwnTruck = (id: string, vehicleId: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Loads are planned by the Operations Officer or Manager');
    if (g) return fail(g);
    const l = s.loads.find((x) => x.id === id)!;
    if (l.status !== 'PLANNED') return fail('This load is already assigned');
    const v = ops.state.vehicles.find((x) => x.id === vehicleId)!;
    if (v.capacityKg < l.kg) return fail(`${v.reg} carries ${v.capacityKg.toLocaleString()} kg — this load is ${l.kg.toLocaleString()} kg`);
    const r = ops.startTrip(vehicleId, `Load ${l.number}`, l.lane, v.driver);
    if (!r.ok) return r;
    commit({ ...ref.current, loads: ref.current.loads.map((x) => (x.id === id ? { ...x, vehicleId, cost: 0, status: 'IN_TRANSIT', actualPickup: TODAY, history: [...x.history, log(`On our truck ${v.reg}`)] } : x)) });
    return done('Own truck assigned', `${v.reg} is on the road`);
  };
  const progressLoad = (id: string, to: 'IN_TRANSIT' | 'DELIVERED' | 'TURNED_BACK', note = ''): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Operations tracks loads');
    if (g) return fail(g);
    const l = s.loads.find((x) => x.id === id)!;
    const allowed: Record<string, Load['status'][]> = { IN_TRANSIT: ['TENDERED'], DELIVERED: ['IN_TRANSIT'], TURNED_BACK: ['TENDERED', 'IN_TRANSIT'] };
    if (!allowed[to].includes(l.status)) return fail(`A ${l.status.toLowerCase().replace('_', ' ')} load cannot be marked ${to.toLowerCase().replace('_', ' ')}`);
    if (to === 'TURNED_BACK' && !note.trim()) return fail('Say why the load was turned back');
    const patch: Partial<Load> = { status: to, ...(to === 'IN_TRANSIT' ? { actualPickup: TODAY } : {}), ...(to === 'DELIVERED' ? { actualDelivery: TODAY } : {}) };
    commit({ ...s, loads: s.loads.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log({ IN_TRANSIT: 'Picked up', DELIVERED: 'Delivered', TURNED_BACK: 'Turned back' }[to], note || undefined)] } : x)) });
    return done('Load updated', `${l.number}: ${to.toLowerCase().replace('_', ' ')}`);
  };

  /* ================= Warehouse billing ================= */
  const setTariff = (activity: string, rate: number): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Tariffs are set by the Operations Manager');
    if (g) return fail(g);
    if (!(rate >= 0)) return fail('Rate cannot be negative');
    const before = s.tariffs.find((t) => t.activity === activity)?.rate;
    commit({ ...s, tariffs: s.tariffs.map((t) => (t.activity === activity ? { ...t, rate } : t)) });
    audit({ module: 'Warehousing', by: actor.name, action: 'Tariff changed', ref: activity, field: 'rate', before: String(before), after: String(rate) });
    return done('Tariff saved', `${activity}: ${rate}`);
  };
  const billOwner = (owner: string, from: string, to: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Warehouse billing is run by the Operations Officer or Manager');
    if (g) return fail(g);
    if (owner === 'OWN') return fail('Choose a customer — own stock is not billed');
    if (from > to) return fail('The period start is after its end');
    const overlap = s.billingRuns.find((r) => r.owner === owner && !(to < r.from || from > r.to));
    if (overlap) return fail(`${overlap.from} to ${overlap.to} is already billed (${overlap.invoiceNumber})`);
    const b = billingFor(s, owner, from, to);
    if (!(b.total > 0)) return fail('Nothing to bill for this period');
    const cust = finance.snapshot().parties.find((p) => p.id === owner);
    const r = finance.saveDocument(
      {
        kind: 'INVOICE',
        partyId: owner,
        date: TODAY,
        dueDate: addDays(TODAY, cust?.terms ?? 30),
        reference: `Warehouse charges ${from} to ${to}`,
        department: 'Operations',
        notes: 'Tea warehousing: handling, storage and stuffing',
        lines: b.lines.filter((l) => l.amount > 0).map((l) => ({ id: uid('l'), description: `${l.activity.replace('_', ' ').toLowerCase()} — ${l.qty.toLocaleString()} ${l.unit}`, account: '4100', qty: l.qty, price: l.rate, vat: cust?.pin !== 'NON-RESIDENT' }))
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const inv = finance.snapshot().documents.find((x) => x.id === r.id)!;
    commit({ ...s, billingRuns: [{ id: uid('wb'), owner, from, to, amount: b.total, invoiceId: inv.id, invoiceNumber: inv.number, by: actor.name }, ...s.billingRuns] });
    return done('Warehouse invoice raised', `${inv.number} · KES ${b.total.toLocaleString()} (draft in Finance)`);
  };

  /* ================= Tea auction and warrants ================= */
  const auctionStep = (lotId: string, step: 'CATALOGUE' | 'SOLD' | 'UNSOLD' | 'PAID' | 'RELEASE' | 'DELIVER', input: { saleNo?: string; catalogueNo?: string; broker?: string; valuationUsd?: number; buyer?: string; priceUsd?: number } = {}): Result => {
    const s = ref.current;
    const g = guard(step === 'RELEASE' || step === 'DELIVER' ? ['STOREKEEPER', 'MANAGER'] : ['OFFICER', 'MANAGER'], step === 'RELEASE' || step === 'DELIVER' ? 'Stores releases and delivers tea' : 'Auction steps are recorded by the Operations Officer');
    if (g) return fail(g);
    const lot = lotOf(lotId)!;
    const a = lot.auction ?? { saleNo: input.saleNo ?? '', broker: input.broker ?? '', status: 'RECEIVED' as const };
    const need: Record<typeof step, string[]> = { CATALOGUE: ['RECEIVED', 'UNSOLD'], SOLD: ['CATALOGUED'], UNSOLD: ['CATALOGUED'], PAID: ['SOLD'], RELEASE: ['PAID'], DELIVER: ['RELEASED'] };
    if (!need[step].includes(a.status)) return fail(`A ${a.status.toLowerCase()} lot cannot be ${step.toLowerCase()}`);
    let patch: Partial<TeaLot> = {};
    let note = '';
    let nx = s;
    if (step === 'CATALOGUE') {
      if (lot.qc !== 'PASS') return fail('Only QC-passed tea can be offered for sale');
      if (!input.saleNo?.trim() || !input.catalogueNo?.trim() || !input.broker?.trim()) return fail('Enter the sale number, catalogue number and broker');
      patch = { auction: { ...a, saleNo: input.saleNo, catalogueNo: input.catalogueNo, broker: input.broker, valuationUsd: input.valuationUsd, status: 'CATALOGUED' } };
      note = `${input.saleNo} · lot ${input.catalogueNo}`;
    }
    if (step === 'SOLD') {
      if (!input.buyer || !(input.priceUsd! > 0)) return fail('Enter the buyer and the hammer price');
      patch = { auction: { ...a, status: 'SOLD', buyer: input.buyer, priceUsd: input.priceUsd, promptDate: addDays(TODAY, 13) } };
      note = `${partyName(input.buyer)} @ USD ${input.priceUsd}/kg`;
    }
    if (step === 'UNSOLD') {
      patch = { auction: { ...a, status: 'UNSOLD', catalogueNo: undefined } };
      note = 'Returned from sale — re-offer at the next sale';
    }
    if (step === 'PAID') {
      patch = { auction: { ...a, status: 'PAID' } };
      note = 'Prompt payment received';
    }
    if (step === 'RELEASE') {
      const w = s.warrants.find((x) => x.lotIds.includes(lotId) && x.status !== 'CANCELLED');
      if (w && w.status !== 'ENDORSED' && w.status !== 'SURRENDERED') return fail(`Warrant ${w.number} must be endorsed to the buyer first`);
      patch = { auction: { ...a, status: 'RELEASED' }, owner: a.buyer ?? lot.owner, ownership: 'CUSTOMER' };
      note = `Released to ${partyName(a.buyer ?? '')}`;
      nx = { ...nx, lotMoves: [lotMove({ lotId, kind: 'RELEASE', kg: 0, bags: lot.bags, from: lot.owner, to: a.buyer, ref: a.saleNo }), ...nx.lotMoves] };
    }
    if (step === 'DELIVER') {
      const w = s.warrants.find((x) => x.lotIds.includes(lotId) && x.status !== 'CANCELLED' && x.status !== 'SURRENDERED');
      if (w) return fail(`Collect and surrender warrant ${w.number} before the tea leaves`);
      patch = { auction: { ...a, status: 'DELIVERED' }, netKg: 0, bags: 0, status: 'DEPLETED', reservedKg: 0 };
      note = 'Outward delivery to the buyer';
      nx = { ...nx, lotMoves: [lotMove({ lotId, kind: 'DELIVERY', kg: -lot.netKg, bags: -lot.bags, from: lot.warehouseId, to: partyName(lot.owner), ref: a.saleNo }), ...nx.lotMoves], hus: nx.hus.map((h) => (h.lotId === lotId ? { ...h, status: 'LOADED' } : h)) };
    }
    commit({ ...nx, lots: patchLot(nx.lots, lotId, patch, { CATALOGUE: 'Catalogued for auction', SOLD: 'Sold at auction', UNSOLD: 'Unsold — returned', PAID: 'Prompt paid', RELEASE: 'Released to buyer', DELIVER: 'Delivered out' }[step], note) });
    return done('Auction updated', `${lot.lotNo}: ${note}`);
  };
  const issueWarrant = (lotIds: string[], holder: string): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Warehouse warrants are issued by Stores or the Operations Manager');
    if (g) return fail(g);
    if (!lotIds.length || !holder.trim()) return fail('Choose the lots and the holder');
    const taken = lotIds.find((id) => s.warrants.some((w) => w.lotIds.includes(id) && (w.status === 'ISSUED' || w.status === 'ENDORSED')));
    if (taken) return fail(`${lotOf(taken)?.lotNo} already has a live warrant`);
    const bad = lotIds.map((id) => lotOf(id)!).find((l) => l.status !== 'IN_STOCK');
    if (bad) return fail(`${bad.lotNo} is not in stock`);
    const { number, sequence } = next(s, 'WRT');
    commit({ ...s, sequence, warrants: [{ id: uid('wr'), number, lotIds, holder: holder.trim(), issued: TODAY, status: 'ISSUED', history: [log('Warrant issued', holder)] }, ...s.warrants] });
    return done('Warrant issued', `${number} to ${holder}`, number);
  };
  const warrantStep = (id: string, step: 'ENDORSE' | 'SURRENDER' | 'CANCEL', holder = ''): Result => {
    const s = ref.current;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Warrants are handled by Stores or the Operations Manager');
    if (g) return fail(g);
    const w = s.warrants.find((x) => x.id === id)!;
    if (step === 'ENDORSE' && (w.status !== 'ISSUED' || !holder.trim())) return fail(w.status !== 'ISSUED' ? 'Only issued warrants can be endorsed' : 'Enter the new holder');
    if (step === 'SURRENDER' && w.status !== 'ENDORSED' && w.status !== 'ISSUED') return fail('This warrant is not live');
    if (step === 'CANCEL' && w.status === 'SURRENDERED') return fail('Already surrendered');
    const patch = step === 'ENDORSE' ? { status: 'ENDORSED' as const, holder: holder.trim() } : step === 'SURRENDER' ? { status: 'SURRENDERED' as const } : { status: 'CANCELLED' as const };
    commit({ ...s, warrants: s.warrants.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log({ ENDORSE: 'Endorsed', SURRENDER: 'Surrendered at release', CANCEL: 'Cancelled' }[step], holder || undefined)] } : x)) });
    audit({ module: 'Warehousing', by: actor.name, action: `Warrant ${step.toLowerCase()}`, ref: w.number, field: 'holder', before: w.holder, after: patch.status === 'ENDORSED' ? holder : w.holder });
    return done('Warrant updated', `${w.number}: ${patch.status.toLowerCase()}`);
  };
  /** Sale results file (EATTA / broker catalogue export, CSV or simulated feed) applied to catalogued lots. */
  const importSaleResults = (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    let imported = 0;
    if (!access.canWrite) return { imported, errors: [READ_ONLY] };
    for (const [i, r] of rows.entries()) {
      const lot = ref.current.lots.find((l) => l.auction?.catalogueNo === r.catalogueNo || l.lotNo === r.lotNo);
      if (!lot) {
        errors.push(`Row ${i + 2}: no catalogued lot ${r.catalogueNo || r.lotNo}`);
        continue;
      }
      const price = Number(r.priceUsd);
      const party = finance.snapshot().parties.find((p) => p.kind === 'CUSTOMER' && (p.id === r.buyer || p.name.toLowerCase() === (r.buyer ?? '').toLowerCase()));
      const res = r.status?.toUpperCase() === 'UNSOLD' ? auctionStep(lot.id, 'UNSOLD') : !party ? ({ ok: false, error: `buyer ${r.buyer} is not a customer` } as Result) : auctionStep(lot.id, 'SOLD', { buyer: party.id, priceUsd: price });
      if (res.ok) imported++;
      else errors.push(`Row ${i + 2}: ${res.error}`);
    }
    return { imported, errors };
  };

  /* ================= Printing jobs ================= */
  const createPrintJob = (j: { ref: string; customerId: string; material: PrintJob['material']; markings: string; qty: number }): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    if (!j.markings.trim() || !(j.qty > 0)) return fail('Enter the markings and quantity');
    const { number, sequence } = next(s, 'PJ');
    commit({ ...s, sequence, printJobs: [{ ...j, id: uid('pj'), number, status: 'REQUESTED', history: [log('Print job requested', j.ref)] }, ...s.printJobs] });
    notify({ module: 'Warehousing', to: 'Printing section', subject: `Print ${j.qty} ${j.material.toLowerCase()} for ${j.ref}`, body: j.markings, ref: number });
    return { ok: true, id: number };
  };
  const printStep = (id: string, step: 'PROOF' | 'APPROVE' | 'REJECT' | 'PRINTED', note = ''): Result => {
    const s = ref.current;
    const j = s.printJobs.find((x) => x.id === id)!;
    if (!access.canWrite) return fail(READ_ONLY);
    if ((step === 'APPROVE' || step === 'REJECT') && !(is('CUSTOMER') && actor.customerId === j.customerId)) return fail('Markings are approved by the customer — switch to the customer portal');
    if ((step === 'PROOF' || step === 'PRINTED') && !is('STOREKEEPER', 'OFFICER', 'MANAGER')) return fail('The printing section is run by Operations');
    const need: Record<typeof step, PrintJob['status'][]> = { PROOF: ['REQUESTED', 'REJECTED'], APPROVE: ['PROOF_SENT'], REJECT: ['PROOF_SENT'], PRINTED: ['APPROVED_BY_CLIENT'] };
    if (!need[step].includes(j.status)) return fail(step === 'PRINTED' ? 'The client must approve the markings before printing' : `Not possible while ${j.status.toLowerCase().replace(/_/g, ' ')}`);
    if (step === 'REJECT' && !note.trim()) return fail('Say what to change on the markings');
    const status = { PROOF: 'PROOF_SENT', APPROVE: 'APPROVED_BY_CLIENT', REJECT: 'REJECTED', PRINTED: 'PRINTED' }[step] as PrintJob['status'];
    commit({ ...s, printJobs: s.printJobs.map((x) => (x.id === id ? { ...x, status, history: [...x.history, log({ PROOF: 'Proof sent to client', APPROVE: 'Markings approved by client', REJECT: 'Markings rejected by client', PRINTED: 'Printed' }[step], note || undefined)] } : x)) });
    if (step === 'PROOF') notify({ module: 'Warehousing', to: partyName(j.customerId), subject: `Approve markings for ${j.ref}`, body: j.markings, ref: j.number });
    return done('Print job updated', `${j.number}: ${status.toLowerCase().replace(/_/g, ' ')}`);
  };

  /* ================= Report schedules and sensors ================= */
  const saveSchedule = (r: Omit<ReportSchedule, 'id'> & { id?: string }): Result => {
    const s = ref.current;
    const g = guard(['MANAGER', 'OFFICER'], 'Report schedules are set by Operations');
    if (g) return fail(g);
    if (!r.report || !r.recipients.trim()) return fail('Choose the report and who receives it');
    if (r.frequency === 'CONDITION' && !r.condition) return fail('Set the condition');
    commit({ ...s, schedules: r.id ? s.schedules.map((x) => (x.id === r.id ? ({ ...x, ...r } as ReportSchedule) : x)) : [...s.schedules, { ...r, id: uid('rs') }] });
    return done('Schedule saved', r.report);
  };
  const runSchedules = (onlyId?: string): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    const due = s.schedules.filter((r) => (onlyId ? r.id === onlyId : scheduleDue(s, r)));
    if (!due.length) return fail('No schedules are due');
    for (const r of due) notify({ module: 'Warehousing', to: r.recipients, subject: `Scheduled report: ${r.report}`, body: r.frequency === 'CONDITION' ? 'Condition met — open Warehousing › Reports for the detail.' : `${r.frequency.toLowerCase()} run`, ref: r.report, level: r.frequency === 'CONDITION' ? 'warning' : 'info' });
    commit({ ...s, schedules: s.schedules.map((x) => (due.some((d) => d.id === x.id) ? { ...x, lastRun: now() } : x)) });
    return done('Reports sent', due.map((r) => r.report).join(', '));
  };
  /** Pull a new reading from every (simulated) sensor; out-of-range readings raise alerts. */
  const pollSensors = (): Result => {
    const s = ref.current;
    const at = now();
    const fresh = buildSensors()
      .filter((_, i) => i % 9 === 8)
      .map((r) => ({ ...r, at, tempC: Math.round((r.tempC + (Math.random() - 0.4) * 3) * 10) / 10, humidity: Math.round(r.humidity + (Math.random() - 0.3) * 8) }));
    const alerts = fresh.filter((r) => r.tempC > SENSOR_LIMITS.tempC || r.humidity > SENSOR_LIMITS.humidity);
    for (const a of alerts) notify({ module: 'Warehousing', to: 'Stores & Quality', subject: `Sensor alert — ${whName(a.warehouseId)}`, body: `${a.tempC} °C, ${a.humidity}% RH (limits ${SENSOR_LIMITS.tempC} °C / ${SENSOR_LIMITS.humidity}%)`, level: 'warning', channels: ['IN_APP', 'SMS'] });
    commit({ ...s, sensors: [...s.sensors, ...fresh].slice(-120) });
    return done('Sensors polled (simulated)', alerts.length ? `${alerts.length} alert(s) raised` : 'All within limits');
  };

  /* ================= Item setup: units, attributes, MSDS ================= */
  const saveSetup = (patch: Partial<ItemSetup>, what: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER', 'OFFICER'], 'Item setup is maintained by Operations');
    if (g) return fail(g);
    for (const list of Object.values(patch.uoms ?? {})) {
      if (list.some((u) => !u.code.trim() || !(u.factor > 0))) return fail('Every unit needs a code and a factor above zero');
      if (new Set(list.map((u) => u.code.trim().toLowerCase())).size !== list.length) return fail('Unit codes must be unique for the item');
    }
    if (patch.attributeDefs && new Set(patch.attributeDefs.map((a) => a.key.trim().toLowerCase())).size !== patch.attributeDefs.length) return fail('Attribute names must be unique');
    commit({ ...s, setup: { ...s.setup, ...patch } });
    audit({ module: 'Warehousing', by: actor.name, action: 'Item setup changed', ref: what });
    return done('Saved', what);
  };
  const saveMsds = (m: Msds): Result => {
    if (!m.key.trim() || !m.title.trim() || !m.hazards.trim()) return fail('Enter the product or group, title and hazards');
    const list = ref.current.setup.msds;
    return saveSetup({ msds: list.some((x) => x.key === m.key) ? list.map((x) => (x.key === m.key ? { ...m, updated: TODAY } : x)) : [...list, { ...m, updated: TODAY }] }, `MSDS ${m.key}`);
  };

  /** CSV import of tea lots already in a godown (opening balances / 3PL uploads). */
  const importLots = (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    let imported = 0;
    const g = guard(['STOREKEEPER', 'MANAGER'], 'Stores imports stock');
    if (g) return { imported, errors: [g] };
    let s = ref.current;
    const add: TeaLot[] = [];
    const moves: LotMove[] = [];
    rows.forEach((r, i) => {
      const bags = Number(r.bags);
      const kgPerBag = Number(r.kgPerBag);
      const wh = ops.state.warehouses.find((w) => w.id === r.warehouse || w.name === r.warehouse);
      const err = !r.lotNo ? 'lotNo missing' : s.lots.some((l) => l.lotNo === r.lotNo) || add.some((l) => l.lotNo === r.lotNo) ? `lot ${r.lotNo} already exists` : !r.garden || !r.grade ? 'garden and grade are required' : !(bags > 0) || !(kgPerBag > 0) ? 'bags and kgPerBag must be numbers above zero' : !wh ? `unknown warehouse ${r.warehouse}` : '';
      if (err) {
        errors.push(`Row ${i + 2}: ${err}`);
        return;
      }
      const id = uid('lot');
      const kg = round2(bags * kgPerBag);
      add.push({ id, lotNo: r.lotNo, garden: r.garden, mark: r.garden.toUpperCase(), grade: r.grade, invoiceNo: r.invoiceNo || '—', season: r.season || TODAY.slice(0, 4), origin: 'Kenya', owner: r.owner || 'OWN', ownership: (r.owner && r.owner !== 'OWN' ? 'CUSTOMER' : 'OWNED') as Ownership, warehouseId: wh!.id, arrival: r.arrival || TODAY, expiry: addDays(r.arrival || TODAY, 730), bags, kgPerBag, netKg: kg, declaredKg: kg, costPerKg: Number(r.costPerKg) || 0, qc: 'PENDING', reservedKg: 0, status: 'IN_STOCK', history: [log('Imported from CSV')] });
      moves.push(lotMove({ lotId: id, kind: 'RECEIPT', kg, bags, to: wh!.id, ref: 'CSV import' }));
      imported++;
    });
    s = { ...s, lots: [...add, ...s.lots], lotMoves: [...moves, ...s.lotMoves] };
    if (imported) commit(s);
    return { imported, errors };
  };

  const reset = () => commit(buildWarehouseExtSeed(commercial.snapshot()));

  return {
    state,
    actor,
    ops,
    whName,
    partyName,
    saveLocation,
    moveLot,
    setQc,
    transferOwnership,
    consumeConsignment,
    reserveLots,
    releaseLots,
    createAsn,
    asnArrived,
    receiveAsn,
    cancelAsn,
    gateIn,
    moveInYard,
    gateOut,
    autoAssign,
    setTask,
    addTask,
    saveCountPlan,
    startHuCount,
    scanHu,
    submitHuCount,
    approveHuCount,
    createPickList,
    confirmPick,
    packList,
    createLoadingPlan,
    updatePlan,
    certifyVgm,
    stuffContainer,
    recordPod,
    createRma,
    receiveReturn,
    creditReturn,
    rejectReturn,
    createLoad,
    tenderLoad,
    assignOwnTruck,
    progressLoad,
    setTariff,
    billOwner,
    auctionStep,
    issueWarrant,
    warrantStep,
    importSaleResults,
    createPrintJob,
    printStep,
    saveSchedule,
    runSchedules,
    pollSensors,
    saveSetup,
    saveMsds,
    importLots,
    reset
  };
};

export const WarehouseExtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useWarehouseExtStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useWarehouseExt = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarehouseExt must be used inside WarehouseExtProvider');
  return ctx;
};
