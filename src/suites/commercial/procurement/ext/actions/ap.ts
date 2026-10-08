import { addDays, daysBetween, round2, TODAY } from '../../../../finance/engine';
import type { Ctx, Result } from '../ctx';
import { approveSteps, invoiceGross, matchInvoice, overdueUpdate, PIN_RE, ruleFor, toleranceFor } from '../engine';
import type { InvoiceLine, SupplierInvoice, SupplierNote, Tolerance } from '../types';

export type InvoiceDraft = Pick<SupplierInvoice, 'supplierId' | 'supplierRef' | 'poId' | 'date' | 'currency' | 'kind' | 'lines' | 'charges' | 'controlTotal' | 'source'> & { advanceApplied?: number };

export const apActions = (c: Ctx) => {
  const { get, commit, fail, done, log, uid, next, now } = c;
  const inv = (id: string) => get().invoices.find((x) => x.id === id);
  const setInv = (id: string, patch: (x: SupplierInvoice) => Partial<SupplierInvoice>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, invoices: s.invoices.map((x) => (x.id === id ? { ...x, ...patch(x), history: [...x.history, log(action, note)] } : x)) });
  };
  const profileOf = (partyId: string) => get().suppliers.find((p) => p.partyId === partyId);

  /** Why a supplier may not invoice at all right now (blocked, or an overdue update request). */
  const invoiceBlock = (partyId: string) => {
    const p = profileOf(partyId);
    if (p && (p.status === 'SUSPENDED' || p.status === 'TERMINATED')) return `${p.name} is ${p.status.toLowerCase()} — invoices are not accepted`;
    const u = overdueUpdate(p);
    if (u) return `${p!.name} has not answered the update request due ${u.due} — invoices are held until they respond`;
    return null;
  };
  /** Tax compliance checks that put an invoice on hold. */
  const taxHolds = (partyId: string) => {
    const out: string[] = [];
    const party = c.party(partyId);
    if (party && party.pin !== 'NON-RESIDENT' && !PIN_RE.test(party.pin)) out.push(`Supplier KRA PIN "${party.pin}" is not valid`);
    const tcc = profileOf(partyId)?.documents.filter((d) => d.type === 'TAX_COMPLIANCE').sort((a, b) => b.expiry.localeCompare(a.expiry))[0];
    if (tcc && tcc.expiry < TODAY) out.push(`Tax compliance certificate expired on ${tcc.expiry}`);
    return out;
  };

  const capture = (d: InvoiceDraft): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (d.source === 'INTERNAL' && c.actor.role === 'STOREKEEPER') return fail('Supplier invoices are captured by Purchasing or Accounts');
    if (!d.supplierId) return fail('Choose the supplier');
    const block = invoiceBlock(d.supplierId);
    if (block) return fail(block);
    if (!d.supplierRef.trim()) return fail("Enter the supplier's invoice number");
    const dup = get().invoices.find((x) => x.supplierId === d.supplierId && x.status !== 'REJECTED' && x.supplierRef.trim().toLowerCase() === d.supplierRef.trim().toLowerCase());
    if (dup) return fail(`Invoice ${d.supplierRef} from this supplier is already registered as ${dup.number}`);
    // Invoice date lock: no future dates; back-dating beyond the allowed window needs a manager
    if (!d.date) return fail('Enter the invoice date');
    if (d.date > TODAY) return fail('Invoices cannot be dated in the future');
    const lim = get().settings.backdateDays;
    if (daysBetween(d.date, TODAY) > lim && c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail(`Invoices older than ${lim} days need the Commercial Manager to capture them`);
    const lines = d.lines.filter((l) => l.description.trim() || l.qty);
    if (!lines.length) return fail('Add the invoice lines');
    if (lines.some((l) => !(l.qty > 0) || !(l.price > 0))) return fail('Every line needs a quantity and price above zero');
    if (d.charges.some((x) => x.amount < 0)) return fail('Charges cannot be negative');
    const fx = get().fx[d.currency];
    if (!fx) return fail(`No exchange rate for ${d.currency} — add it under Settings`);
    if (d.kind === 'STANDARD' && d.poId) {
      const po = c.com.state.purchaseOrders.find((o) => o.id === d.poId);
      if (!po || po.supplierId !== d.supplierId) return fail('That purchase order is not for this supplier');
      if (lines.some((l) => !l.poLineId)) return fail('Link every line to a purchase order line, or capture the extra as a charge');
    }
    if (d.kind === 'ADVANCE' && !d.poId) return fail('An advance invoice is raised against a purchase order');
    // Header control: the total typed from the invoice must equal lines + charges + VAT
    const gross = invoiceGross({ lines, charges: d.charges });
    if (Math.abs(d.controlTotal - gross) > 0.01) return fail(`Invoice total ${d.controlTotal.toLocaleString()} does not agree to lines + VAT ${gross.toLocaleString()} — check the invoice`);
    const s = get();
    const { number, sequence } = next(s, 'SINV');
    const advanceLeft = d.poId && d.kind === 'STANDARD' ? s.invoices.filter((x) => x.poId === d.poId && x.kind === 'ADVANCE' && x.status === 'BILLED').reduce((a, x) => a + round2(invoiceGross(x) * x.fxRate), 0) - s.invoices.filter((x) => x.poId === d.poId && x.kind === 'STANDARD').reduce((a, x) => a + x.advanceApplied, 0) : 0;
    const rec: SupplierInvoice = {
      ...d,
      lines: lines.map((l) => ({ ...l, id: l.id || uid('il') })),
      id: uid('si'),
      number,
      received: TODAY,
      fxRate: fx,
      advanceApplied: Math.max(0, Math.min(d.advanceApplied ?? advanceLeft, round2(gross * fx))),
      creditApplied: 0,
      matchMode: toleranceFor(s.tolerances, d.supplierId, c.party(d.supplierId)?.category).mode,
      variances: [],
      status: 'CAPTURED',
      preparedBy: d.source === 'SUPPLIER' ? 'Supplier portal' : c.actor.name,
      history: [log(d.source === 'SUPPLIER' ? 'Submitted on the supplier portal' : 'Captured', d.currency !== 'KES' ? `${d.currency} at ${fx}` : undefined)]
    };
    commit({ ...s, sequence, invoices: [rec, ...s.invoices] });
    if (d.source === 'SUPPLIER') c.notifyRole('OFFICER', `Supplier invoice received: ${c.party(d.supplierId)?.name}`, `${d.supplierRef} · ${d.currency} ${gross.toLocaleString()}`, number);
    return done(d.source === 'SUPPLIER' ? 'Invoice submitted' : 'Invoice captured', `${number} — match it to the order and receipts next`, rec.id);
  };

  /** Runs the 2-way / 3-way match and the tax checks; anything outside tolerance puts the invoice on hold. */
  const match = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const x = inv(id);
    if (!x) return fail('Invoice not found');
    if (x.status !== 'CAPTURED' && x.status !== 'ON_HOLD') return fail('This invoice has already been matched');
    const tol: Tolerance = toleranceFor(get().tolerances, x.supplierId, c.party(x.supplierId)?.category);
    const holds = taxHolds(x.supplierId);
    if (x.kind === 'ADVANCE' || !x.poId) {
      const reason = holds.join('; ');
      setInv(id, () => ({ variances: [], matchMode: tol.mode, status: reason ? 'ON_HOLD' : 'MATCHED', hold: reason ? { reason, by: 'System', at: now() } : undefined }), reason ? 'Put on hold' : 'Checked — no order match needed', reason || (x.kind === 'ADVANCE' ? 'Advance against order' : 'Non-order invoice'));
      return reason ? fail(`On hold: ${reason}`) : done('Ready to post', x.number);
    }
    const po = c.com.state.purchaseOrders.find((o) => o.id === x.poId);
    const variances = matchInvoice(po, c.com.state.receipts, x.lines, tol, tol.mode, x.fxRate);
    const out = variances.filter((v) => !v.within);
    const reasons = [...out.map((v) => `${v.description}: ${v.kind === 'NO_RECEIPT' ? 'nothing received yet' : v.kind === 'NOT_ON_PO' ? 'not on the order' : `${v.kind.toLowerCase()} ${v.actual.toLocaleString()} vs ${v.expected.toLocaleString()}`}`), ...holds];
    if (reasons.length) {
      setInv(id, () => ({ variances, matchMode: tol.mode, status: 'ON_HOLD', hold: { reason: reasons.join('; '), by: 'System', at: now() } }), `${tol.mode === 'TWO_WAY' ? 'Two' : 'Three'}-way match failed — on hold`, reasons.join('; '));
      c.notifySupplier(x.supplierId, `Invoice ${x.supplierRef} is on hold`, reasons.join('; '), x.number);
      return fail(`On hold: ${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''}`);
    }
    setInv(id, () => ({ variances, matchMode: tol.mode, status: 'MATCHED', hold: undefined }), `${tol.mode === 'TWO_WAY' ? 'Two' : 'Three'}-way match passed`, variances.length ? `${variances.length} variance(s) within tolerance` : 'Exact match');
    return done('Matched', `${x.number} agrees to the order${tol.mode === 'THREE_WAY' ? ' and goods received' : ''}`);
  };

  const hold = (id: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!reason.trim()) return fail('Give the reason for the hold');
    const x = inv(id);
    if (!x || x.status === 'BILLED' || x.status === 'REJECTED') return fail('This invoice cannot be put on hold');
    setInv(id, () => ({ status: 'ON_HOLD', hold: { reason, by: c.actor.name, at: now() } }), 'Put on hold', reason);
    c.notifySupplier(x.supplierId, `Invoice ${x.supplierRef} is on hold`, reason, x.number);
    return done('On hold', x.number);
  };

  const release = (id: string, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const x = inv(id);
    if (!x || x.status !== 'ON_HOLD') return fail('Only invoices on hold can be released');
    const need = approveSteps(ruleFor(get().rules, 'INVOICE_HOLD', invoiceGross(x) * x.fxRate))[0]?.role ?? 'MANAGER';
    if (c.actor.role !== need && c.actor.role !== 'DIRECTOR') return fail('Holds are released by the Commercial Manager');
    if (x.preparedBy === c.actor.name) return fail('You captured this invoice, so someone else must release the hold');
    if (!note.trim()) return fail('Record why the hold is being released');
    const block = invoiceBlock(x.supplierId);
    if (block) return fail(block);
    setInv(id, () => ({ status: 'MATCHED', hold: undefined }), 'Hold released', note);
    c.notifySupplier(x.supplierId, `Invoice ${x.supplierRef} released for payment processing`, note, x.number);
    return done('Hold released', `${x.number} can be posted`);
  };

  /** Creates the Finance bill. Order invoices bill the received lines; advances go to prepayments. */
  const post = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const x = inv(id);
    if (!x) return fail('Invoice not found');
    if (x.status !== 'MATCHED') return fail(x.status === 'ON_HOLD' ? 'Release the hold first' : 'Match the invoice first');
    const block = invoiceBlock(x.supplierId);
    if (block) return fail(block);
    const released = x.history.some((h) => h.action === 'Hold released');
    const charges = x.charges.filter((ch) => ch.amount > 0).map((ch) => ({ description: ch.type === 'SHIPPING' ? 'Shipping charge' : ch.type === 'HANDLING' ? 'Handling charge' : 'Other charge', account: '6300', amount: round2(ch.amount * x.fxRate), vat: true }));
    const po = c.com.state.purchaseOrders.find((o) => o.id === x.poId);
    const note = [x.currency !== 'KES' ? `${x.currency} ${invoiceGross(x).toLocaleString()} at ${x.fxRate}` : '', x.advanceApplied ? `Advance of KES ${x.advanceApplied.toLocaleString()} to offset` : '', x.creditApplied ? `Credit notes of KES ${x.creditApplied.toLocaleString()} to offset` : '', released ? 'Hold released by approver' : ''].filter(Boolean).join(' · ');
    let r: Result;
    if (x.kind === 'STANDARD' && po && x.lines.every((l) => {
      const pl = po.lines.find((y) => y.id === l.poLineId);
      return pl && l.qty <= pl.received - pl.billed;
    })) {
      r = c.com.billPO(po.id, x.supplierRef, { lines: x.lines.map((l) => ({ lineId: l.poLineId!, qty: l.qty, price: round2(l.price * x.fxRate) })), matched: !released && x.variances.every((v) => v.within), extra: charges, note: note || undefined });
    } else {
      if (x.kind === 'STANDARD' && po && x.matchMode === 'THREE_WAY') return fail('Goods for this invoice have not been received — post a goods-received note first');
      const party = c.party(x.supplierId);
      r = c.fin.saveDocument(
        {
          kind: 'BILL',
          partyId: x.supplierId,
          date: x.date,
          dueDate: addDays(x.date, party?.terms ?? 30),
          reference: x.supplierRef,
          department: 'Operations',
          notes: [x.kind === 'ADVANCE' ? `Advance on ${po?.number}` : po ? `Two-way matched to ${po.number}` : 'Non-order invoice', note].filter(Boolean).join(' · '),
          match: po ? { po: po.number, grn: '', matched: !released && x.variances.every((v) => v.within) } : undefined,
          lines: [
            ...x.lines.map((l: InvoiceLine) => ({ id: uid('l'), description: l.description, account: x.kind === 'ADVANCE' ? '1300' : l.account, qty: l.qty, price: round2(l.price * x.fxRate), vat: l.vat })),
            ...charges.map((ch) => ({ id: uid('l'), description: ch.description, account: ch.account, qty: 1, price: ch.amount, vat: ch.vat }))
          ]
        },
        c.actor.name
      );
    }
    if (!r.ok || !r.id) return r;
    const bill = c.fin.snapshot().documents.find((d) => d.id === r.id);
    setInv(id, () => ({ status: 'BILLED', billId: r.id, billNumber: bill?.number }), `Posted to Finance — ${bill?.number}`);
    return done('Bill created in Finance', `${bill?.number} from ${x.number}`, r.id);
  };

  const reject = (id: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!reason.trim()) return fail('Tell the supplier why');
    const x = inv(id);
    if (!x || x.status === 'BILLED') return fail('Posted invoices cannot be rejected — raise a credit note');
    setInv(id, () => ({ status: 'REJECTED' }), 'Rejected', reason);
    c.notifySupplier(x.supplierId, `Invoice ${x.supplierRef} rejected`, reason, x.number, true);
    return done('Invoice rejected', x.number);
  };

  /** Simulated KRA eTIMS check: no live government API in this build. */
  const validateEtims = (id: string): Result => {
    const x = inv(id);
    if (!x) return fail('Invoice not found');
    const party = c.party(x.supplierId);
    const ok = !!party && (party.pin === 'NON-RESIDENT' || PIN_RE.test(party.pin));
    const cu = `KRAMW${String(Math.abs([...x.supplierRef].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)) % 1e10).padStart(10, '0')}`;
    setInv(id, () => ({ etims: { cu, validatedAt: now(), ok } }), `eTIMS check (simulated): ${ok ? 'valid' : 'failed'}`, cu);
    return ok ? done('eTIMS check passed (simulated)', `Control unit invoice ${cu}`) : fail('eTIMS check failed (simulated): the supplier PIN is not valid');
  };

  /* ---------------- Credit and debit notes ---------------- */
  const raiseNote = (n: Pick<SupplierNote, 'kind' | 'supplierId' | 'invoiceId' | 'grnRef' | 'reason' | 'amount'>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!n.supplierId) return fail('Choose the supplier');
    if (!(n.amount > 0)) return fail('Enter the amount');
    if (!n.reason.trim()) return fail('Give the reason');
    if (n.invoiceId) {
      const x = inv(n.invoiceId);
      if (!x || x.supplierId !== n.supplierId) return fail('That invoice is not from this supplier');
      if (n.amount > round2(invoiceGross(x) * x.fxRate) - x.creditApplied) return fail('The note is larger than what is left on the invoice');
    }
    const s = get();
    const { number, sequence } = next(s, n.kind === 'CREDIT' ? 'SCN' : 'SDN');
    const rec: SupplierNote = { ...n, id: uid('sn'), number, status: 'SUBMITTED', preparedBy: c.actor.name, approvals: [], history: [log(n.kind === 'CREDIT' ? 'Credit note received' : 'Debit note raised'), log('Submitted for approval')] };
    commit({ ...s, sequence, notes: [rec, ...s.notes] });
    c.notifyRole('MANAGER', `${number} to approve`, `${c.party(n.supplierId)?.name}: KES ${n.amount.toLocaleString()}`, number);
    return done(n.kind === 'CREDIT' ? 'Credit note recorded' : 'Debit note raised', `${number} is waiting for approval`, rec.id);
  };
  const decideNote = (id: string, approve: boolean, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Notes are approved by the Commercial Manager');
    const s = get();
    const n = s.notes.find((x) => x.id === id);
    if (!n || n.status !== 'SUBMITTED') return fail('Nothing to decide');
    if (n.preparedBy === c.actor.name) return fail('You raised this note, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Give the reason');
    commit({ ...s, notes: s.notes.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', approvals: approve ? [...x.approvals, { by: c.actor.name, role: c.actor.role, at: now(), note }] : x.approvals, history: [...x.history, log(approve ? 'Approved' : 'Rejected', note || undefined)] } : x)) });
    if (approve && n.kind === 'DEBIT') c.notifySupplier(n.supplierId, `Debit note ${n.number}`, `${n.reason} — KES ${n.amount.toLocaleString()} will be deducted from your next payment.`, n.number);
    return done(approve ? 'Note approved' : 'Note rejected', n.number);
  };
  /** Offsets an approved note against a supplier invoice (reduces what is payable on it). */
  const applyNote = (id: string, invoiceId: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const s = get();
    const n = s.notes.find((x) => x.id === id);
    const x = s.invoices.find((y) => y.id === invoiceId);
    if (!n || n.status !== 'APPROVED') return fail('Only approved notes can be applied');
    if (!x || x.supplierId !== n.supplierId) return fail('Choose an invoice from the same supplier');
    if (x.status === 'REJECTED') return fail('That invoice was rejected');
    const left = round2(invoiceGross(x) * x.fxRate - x.advanceApplied - x.creditApplied);
    if (n.amount > left + 0.005) return fail(`Only KES ${left.toLocaleString()} is left payable on ${x.number}`);
    commit({
      ...s,
      notes: s.notes.map((y) => (y.id === id ? { ...y, status: 'APPLIED', invoiceId, history: [...y.history, log(`Applied to ${x.number}`)] } : y)),
      invoices: s.invoices.map((y) => (y.id === invoiceId ? { ...y, creditApplied: round2(y.creditApplied + n.amount), history: [...y.history, log(`${n.number} applied`, `KES ${n.amount.toLocaleString()}`)] } : y))
    });
    return done('Note applied', `${n.number} offsets ${x.number}`);
  };

  const saveTolerance = (t: Omit<Tolerance, 'id'> & { id?: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Match tolerances are set by the Commercial Manager or Finance Director');
    if ([t.pricePct, t.qtyPct, t.amount].some((v) => v < 0)) return fail('Tolerances cannot be negative');
    if (t.pricePct > 20 || t.qtyPct > 20) return fail('Tolerances above 20% defeat the purpose of matching');
    const s = get();
    if (s.tolerances.some((x) => x.scope === t.scope && x.id !== t.id)) return fail('There is already a tolerance for that scope');
    const rec = { ...t, id: t.id || uid('tl') } as Tolerance;
    commit({ ...s, tolerances: [...s.tolerances.filter((x) => x.id !== rec.id), rec] });
    return done('Tolerance saved', t.scope === 'DEFAULT' ? 'Default' : (c.party(t.scope)?.name ?? t.scope));
  };
  const setFx = (currency: string, rate: number): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Exchange rates are maintained by the Finance Director or Commercial Manager');
    if (!/^[A-Z]{3}$/.test(currency)) return fail('Use a 3-letter currency code');
    if (!(rate > 0)) return fail('Enter a rate above zero');
    if (currency === 'KES' && rate !== 1) return fail('KES is the base currency');
    commit({ ...get(), fx: { ...get().fx, [currency]: rate } });
    return done('Rate saved', `1 ${currency} = KES ${rate}`);
  };

  return { capture, match, hold, release, post, reject, validateEtims, raiseNote, decideNote, applyNote, saveTolerance, setFx, invoiceBlock };
};
