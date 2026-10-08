import { addDays, round2, TODAY } from '../../../../finance/engine';
import type { ESignature } from '../../../../../platform/Widgets';
import type { Ctx, Result } from '../ctx';
import { contractsExpiring, expiringDocuments, overdueUpdate } from '../engine';
import type { AdHocStep, ApprovalRule, Branding, ClearanceFile, LandedCost, OutputTemplate, PlanLine, ProcExtState, ReqExt, SavedReport } from '../types';

export const CLEARANCE_MILESTONES = [
  { key: 'DOCS', label: 'Documents received (B/L, invoice, packing list)' },
  { key: 'IDF', label: 'Import declaration (IDF) lodged' },
  { key: 'ENTRY', label: 'Customs entry passed' },
  { key: 'DUTY', label: 'Duty and taxes paid' },
  { key: 'KEBS', label: 'KEBS / port health inspection' },
  { key: 'RELEASE', label: 'Cargo released' },
  { key: 'DELIVERED', label: 'Delivered to warehouse' }
];
export const EXPORT_MILESTONES = [
  { key: 'BOOKING', label: 'Shipping line booking' },
  { key: 'DOCS', label: 'Export documents (invoice, packing list, phytosanitary)' },
  { key: 'ENTRY', label: 'Export entry passed' },
  { key: 'TEA_BOARD', label: 'Tea Board export permit' },
  { key: 'LOADED', label: 'Container loaded and sealed' },
  { key: 'SAILED', label: 'Vessel sailed' }
];

/** Planning, configurable approvals, saved reports, document templates, landed cost and clearing files. */
export const planActions = (c: Ctx) => {
  const { get, commit, fail, done, log, uid, next, now } = c;
  const mgr = () => c.actor.role === 'MANAGER' || c.actor.role === 'DIRECTOR';
  const ro = () => c.readOnly();

  /* ---------------- Procurement plan ---------------- */
  const savePlanLine = (l: Omit<PlanLine, 'id'> & { id?: string }): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    if (s.plan.status === 'APPROVED' && !mgr()) return fail('The plan is approved — only the Commercial Manager can change it');
    if (!l.description.trim()) return fail('Describe what will be bought');
    if (!l.category) return fail('Choose a category');
    if (!(l.estValue > 0)) return fail('Estimate the value');
    if (l.qty < 0) return fail('Quantity cannot be negative');
    const line: PlanLine = { ...l, id: l.id ?? uid('pln') };
    const lines = l.id ? s.plan.lines.map((x) => (x.id === l.id ? line : x)) : [...s.plan.lines, line];
    commit({ ...s, plan: { ...s.plan, lines, status: s.plan.status === 'APPROVED' ? 'APPROVED' : 'DRAFT', history: [...s.plan.history, log(l.id ? 'Plan line edited' : 'Plan line added', l.description)] } });
    return done('Plan updated', l.description);
  };
  const removePlanLine = (id: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    if (s.plan.status !== 'DRAFT') return fail('Lines can be removed while the plan is a draft');
    if (Object.values(s.reqExt).some((x) => x.planLineId === id)) return fail('Requisitions are linked to this line');
    commit({ ...s, plan: { ...s.plan, lines: s.plan.lines.filter((x) => x.id !== id), history: [...s.plan.history, log('Plan line removed')] } });
    return { ok: true };
  };
  const submitPlan = (): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    if (s.plan.status !== 'DRAFT') return fail('The plan has already been submitted');
    if (!s.plan.lines.length) return fail('Add the planned purchases first');
    commit({ ...s, plan: { ...s.plan, status: 'SUBMITTED', approvals: [], history: [...s.plan.history, log('Submitted for approval')] } });
    c.notifyRole('DIRECTOR', `Procurement plan ${s.plan.year} to approve`, `${s.plan.lines.length} lines`);
    return done('Plan submitted', `The ${s.plan.year} plan is with the Finance Director`);
  };
  const decidePlan = (approve: boolean, note: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    if (s.plan.status !== 'SUBMITTED') return fail('The plan is not awaiting approval');
    if (c.actor.role !== 'DIRECTOR') return fail('The annual plan is approved by the Finance Director');
    if (!approve && !note.trim()) return fail('Give a reason for returning the plan');
    commit({
      ...s,
      plan: {
        ...s.plan,
        status: approve ? 'APPROVED' : 'DRAFT',
        approvals: approve ? [{ by: c.actor.name, role: c.actor.role, at: now(), note }] : [],
        history: [...s.plan.history, log(approve ? 'Approved' : 'Returned', note || undefined)]
      }
    });
    return done(approve ? 'Plan approved' : 'Plan returned', String(s.plan.year));
  };
  const setReqExt = (reqId: string, patch: Partial<ReqExt>): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    commit({ ...s, reqExt: { ...s.reqExt, [reqId]: { ...(s.reqExt[reqId] ?? { customFields: {} }), ...patch } } });
    return { ok: true };
  };
  const setPoCurrency = (poId: string, currency: string, fxRate: number): Result => {
    if (ro()) return fail(ro()!);
    if (!(fxRate > 0)) return fail('Enter an exchange rate above zero');
    const s = get();
    const ex = s.poExt[poId] ?? { currency: 'KES', fxRate: 1, revisions: [] };
    commit({ ...s, poExt: { ...s.poExt, [poId]: { ...ex, currency, fxRate: currency === 'KES' ? 1 : fxRate } } });
    return done('Currency set', `${currency} at ${fxRate}`);
  };

  /* ---------------- Approval rules and ad-hoc approvers ---------------- */
  const saveRule = (r: Omit<ApprovalRule, 'id'> & { id?: string }): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Approval rules are set by the Commercial Manager or Finance Director');
    if (!r.name.trim()) return fail('Name the rule');
    if (r.minValue < 0) return fail('The threshold cannot be negative');
    if (!r.steps.some((x) => x.kind === 'APPROVE')) return fail('A rule needs at least one approval step');
    const s = get();
    const rule = { ...r, id: r.id ?? uid('ar') } as ApprovalRule;
    commit({ ...s, rules: r.id ? s.rules.map((x) => (x.id === r.id ? rule : x)) : [...s.rules, rule] });
    return done('Approval rule saved', `${rule.name}: ${rule.steps.map((x) => `${x.kind === 'NOTIFY' ? 'notify ' : ''}${x.role.toLowerCase()}`).join(' → ')}`);
  };
  const toggleRule = (id: string): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Approval rules are set by the Commercial Manager or Finance Director');
    const s = get();
    commit({ ...s, rules: s.rules.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) });
    return { ok: true };
  };
  const addAdHoc = (docRef: string, name: string, kind: AdHocStep['kind']): Result => {
    if (ro()) return fail(ro()!);
    if (!name.trim()) return fail('Name the person to add');
    const s = get();
    if (s.adHoc.some((x) => x.docRef === docRef && x.name === name && !x.doneAt)) return fail(`${name} is already on this document`);
    commit({ ...s, adHoc: [...s.adHoc, { id: uid('ah'), docRef, name: name.trim(), kind, addedBy: c.actor.name, at: now() }] });
    c.notifyRole(c.actor.role, `${kind === 'APPROVE' ? 'Approval' : 'For information'}: ${docRef.split(':')[0]} sent to ${name}`, undefined, docRef);
    return done(kind === 'APPROVE' ? 'Approver added' : 'Added for information', `${name} must ${kind === 'APPROVE' ? 'approve before it moves on' : 'be kept informed'}`);
  };
  const completeAdHoc = (id: string, note: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    const st = s.adHoc.find((x) => x.id === id);
    if (!st || st.doneAt) return fail('Nothing to sign off');
    if (st.kind === 'APPROVE' && st.addedBy === c.actor.name && st.name !== c.actor.name) return fail(`${st.name} must sign this off — record it as them or ask them to`);
    commit({ ...s, adHoc: s.adHoc.map((x) => (x.id === id ? { ...x, doneAt: now(), note: note || undefined } : x)) });
    return done('Signed off', `${st.name} — ${st.kind === 'APPROVE' ? 'approved' : 'acknowledged'}`);
  };
  const pendingAdHoc = (docRef: string) => get().adHoc.filter((x) => x.docRef === docRef && x.kind === 'APPROVE' && !x.doneAt);

  /* ---------------- Reports, templates, branding ---------------- */
  const saveReport = (r: Omit<SavedReport, 'id' | 'owner'> & { id?: string }): Result => {
    if (ro()) return fail(ro()!);
    if (!r.name.trim()) return fail('Name the report');
    if (!r.columns.length) return fail('Pick at least one column');
    const s = get();
    const rec: SavedReport = { ...r, id: r.id ?? uid('rp'), owner: c.actor.name };
    commit({ ...s, reports: r.id ? s.reports.map((x) => (x.id === r.id ? rec : x)) : [...s.reports, rec] });
    return done('Report saved', `${rec.name}${rec.shared ? ' — shared with the team' : ''}`, rec.id);
  };
  const deleteReport = (id: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    const r = s.reports.find((x) => x.id === id);
    if (r && r.owner !== c.actor.name && !mgr()) return fail('Only the owner can delete a report');
    commit({ ...s, reports: s.reports.filter((x) => x.id !== id) });
    return { ok: true };
  };
  const saveTemplate = (t: OutputTemplate): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Document layouts are set by the Commercial Manager');
    if (!t.title.trim()) return fail('Give the document a title');
    const s = get();
    commit({ ...s, templates: [...s.templates.filter((x) => x.docType !== t.docType), t] });
    return done('Template saved', t.docType);
  };
  const saveBranding = (b: Branding): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Branding is set by the Commercial Manager');
    if (!/^#[0-9a-f]{6}$/i.test(b.colour)) return fail('Colour must be a hex value such as #2f6b3a');
    if (!b.name.trim()) return fail('Enter the organisation name');
    commit({ ...get(), branding: b });
    return done('Branding saved', b.name);
  };
  const sign = (docRef: string, sig: ESignature): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    commit({ ...s, signatures: { ...s.signatures, [docRef]: sig } });
    return done('Signed', `${sig.by} — ${sig.meaning}`);
  };
  const saveSettings = (patch: Partial<ProcExtState['settings']>): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Settings are changed by the Commercial Manager');
    const st = { ...get().settings, ...patch };
    if (st.backdateDays < 0 || st.miscIssueLimit < 0 || st.contractAlertDays < 0 || st.docAlertDays < 0) return fail('Values cannot be negative');
    commit({ ...get(), settings: st });
    return done('Settings saved', 'Procurement policy updated');
  };

  /* ---------------- Landed cost ---------------- */
  const createLanded = (poId: string, allocation: LandedCost['allocation']): Result => {
    if (ro()) return fail(ro()!);
    const po = c.com.snapshot().purchaseOrders.find((o) => o.id === poId);
    if (!po || po.status !== 'APPROVED') return fail('Choose an approved purchase order');
    if (!po.lines.some((l) => l.received > 0)) return fail('Receive the goods before costing them');
    const s = get();
    if (s.landed.some((l) => l.poId === poId && l.status === 'DRAFT')) return fail('A draft landed-cost sheet already exists for this order');
    const { number, sequence } = next(s, 'LC');
    const rec: LandedCost = { id: uid('lc'), number, poId, charges: [], allocation, status: 'DRAFT', bills: [], history: [log('Created', po.number)] };
    commit({ ...s, sequence, landed: [rec, ...s.landed] });
    return done('Landed-cost sheet created', `${number} for ${po.number}`, rec.id);
  };
  const addLandedCharge = (id: string, ch: Omit<LandedCost['charges'][number], 'id'>): Result => {
    if (ro()) return fail(ro()!);
    if (!(ch.amount > 0)) return fail('Enter the charge amount');
    if (!ch.supplierId) return fail('Who is billing this charge?');
    const s = get();
    const l = s.landed.find((x) => x.id === id);
    if (!l || l.status !== 'DRAFT') return fail('Charges are added to draft sheets');
    commit({ ...s, landed: s.landed.map((x) => (x.id === id ? { ...x, charges: [...x.charges, { ...ch, id: uid('lch') }], history: [...x.history, log(`${ch.type} added`, ch.amount.toLocaleString())] } : x)) });
    return { ok: true };
  };
  const removeLandedCharge = (id: string, chargeId: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    commit({ ...s, landed: s.landed.map((x) => (x.id === id && x.status === 'DRAFT' ? { ...x, charges: x.charges.filter((ch) => ch.id !== chargeId) } : x)) });
    return { ok: true };
  };
  /** Shares charges over the received lines by value or quantity. */
  const allocate = (l: LandedCost) => {
    const com = c.com.snapshot();
    const po = com.purchaseOrders.find((o) => o.id === l.poId)!;
    const lines = po.lines.filter((x) => x.received > 0 && x.sku);
    const total = l.charges.reduce((a, ch) => a + ch.amount, 0);
    const basis = lines.reduce((a, x) => a + (l.allocation === 'VALUE' ? x.received * x.price : x.received), 0) || 1;
    return lines.map((x) => {
      const share = round2((total * (l.allocation === 'VALUE' ? x.received * x.price : x.received)) / basis);
      return { line: x, share, perUnit: round2(share / x.received), landedUnit: round2(x.price + share / x.received) };
    });
  };
  const postLanded = (id: string): Result => {
    if (ro()) return fail(ro()!);
    if (!mgr()) return fail('Landed costs are posted by the Commercial Manager');
    const s = get();
    const l = s.landed.find((x) => x.id === id);
    if (!l || l.status !== 'DRAFT') return fail('Already posted');
    if (!l.charges.length) return fail('Add the freight, duty and clearing charges first');
    const rows = allocate(l);
    if (!rows.length) return fail('No received items to cost');
    // Revalue stock: the extra cost spread over what is on hand
    const com = c.com.snapshot();
    const changes = rows
      .map((r) => {
        const p = com.products.find((x) => x.sku === r.line.sku);
        if (!p || p.kind === 'SERVICE' || p.stock <= 0) return null;
        return { sku: p.sku, cost: round2(p.cost + r.share / p.stock) };
      })
      .filter((x): x is { sku: string; cost: number } => !!x);
    const rc = c.com.setItemCost(changes);
    if (!rc.ok) return rc;
    // One bill per charge supplier, posted to inventory
    const bills: string[] = [];
    const bySupplier = new Map<string, LandedCost['charges']>();
    for (const ch of l.charges) bySupplier.set(ch.supplierId, [...(bySupplier.get(ch.supplierId) ?? []), ch]);
    for (const [sup, chs] of bySupplier) {
      const r = c.fin.saveDocument(
        {
          kind: 'BILL',
          partyId: sup,
          date: TODAY,
          dueDate: addDays(TODAY, c.party(sup)?.terms ?? 30),
          reference: chs.map((x) => x.ref).filter(Boolean).join(', ') || l.number,
          department: 'Operations',
          notes: `Landed cost ${l.number}`,
          lines: chs.map((x) => ({ id: uid('l'), description: `${x.type.toLowerCase()} — ${l.number}`, account: '1200', qty: 1, price: x.amount, vat: x.type !== 'DUTY' }))
        },
        c.actor.name
      );
      if (r.ok && r.id) bills.push(c.fin.snapshot().documents.find((d) => d.id === r.id)?.number ?? r.id);
    }
    const lots = s.lots.map((lot) => {
      const row = rows.find((r) => r.line.sku === lot.sku);
      const grns = c.com.snapshot().receipts.filter((g) => g.poId === l.poId).map((g) => g.number);
      return row && grns.includes(lot.receivedRef) ? { ...lot, unitCost: round2(lot.unitCost + row.perUnit) } : lot;
    });
    const g = get();
    commit({ ...g, lots, landed: g.landed.map((x) => (x.id === id ? { ...x, status: 'POSTED', postedBy: c.actor.name, bills, history: [...x.history, log('Posted', `Bills ${bills.join(', ')}`)] } : x)) });
    return done('Landed cost posted', `${l.number}: item costs updated, ${bills.length} bill(s) raised in Finance`);
  };

  /* ---------------- Clearing & forwarding files ---------------- */
  const createClearance = (f: Pick<ClearanceFile, 'direction' | 'ownerType' | 'client' | 'customerId' | 'poId' | 'agent' | 'entryNo' | 'goods' | 'feePct'>): Result => {
    if (ro()) return fail(ro()!);
    if (!f.goods.trim()) return fail('Describe the goods');
    if (!f.agent.trim()) return fail('Name the clearing agent');
    if (f.ownerType === 'THIRD_PARTY' && !f.customerId) return fail('Choose the customer being cleared for — they will be invoiced');
    if (f.feePct < 0) return fail('The fee cannot be negative');
    const s = get();
    const { number, sequence } = next(s, 'CF');
    const ms = (f.direction === 'IMPORT' ? CLEARANCE_MILESTONES : EXPORT_MILESTONES).map((m) => ({ ...m }));
    const rec: ClearanceFile = { ...f, id: uid('cf'), number, milestones: ms, charges: [], history: [log('File opened')] };
    commit({ ...s, sequence, clearance: [rec, ...s.clearance] });
    return done('Clearing file opened', number, rec.id);
  };
  const tickMilestone = (id: string, key: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    const f = s.clearance.find((x) => x.id === id);
    if (!f) return fail('File not found');
    const i = f.milestones.findIndex((m) => m.key === key);
    if (i > 0 && !f.milestones[i - 1].done) return fail(`Complete "${f.milestones[i - 1].label}" first`);
    if (f.milestones[i].done) return fail('Already done');
    commit({ ...s, clearance: s.clearance.map((x) => (x.id === id ? { ...x, milestones: x.milestones.map((m) => (m.key === key ? { ...m, done: now() } : m)), history: [...x.history, log(f.milestones[i].label)] } : x)) });
    if (f.customerId) c.notifySupplier(f.customerId, `${f.number}: ${f.milestones[i].label}`, f.goods, f.number);
    return { ok: true };
  };
  const addClearanceCharge = (id: string, type: string, amount: number): Result => {
    if (ro()) return fail(ro()!);
    if (!type.trim() || !(amount > 0)) return fail('Enter the charge and amount');
    const s = get();
    const f = s.clearance.find((x) => x.id === id);
    if (!f || f.invoiceId) return fail('This file has already been invoiced');
    commit({ ...s, clearance: s.clearance.map((x) => (x.id === id ? { ...x, charges: [...x.charges, { type: type.trim(), amount }], history: [...x.history, log(`Charge: ${type}`, amount.toLocaleString())] } : x)) });
    return { ok: true };
  };
  const invoiceClearance = (id: string): Result => {
    if (ro()) return fail(ro()!);
    const s = get();
    const f = s.clearance.find((x) => x.id === id);
    if (!f) return fail('File not found');
    if (f.ownerType === 'OWN') return fail('Own imports are costed through landed cost, not invoiced');
    if (!f.customerId) return fail('No customer on this file');
    if (f.invoiceId) return fail('Already invoiced');
    if (!f.charges.length) return fail('Add the disbursements first');
    const disb = f.charges.reduce((a, x) => a + x.amount, 0);
    const fee = round2((disb * f.feePct) / 100);
    const r = c.fin.saveDocument(
      {
        kind: 'INVOICE',
        partyId: f.customerId,
        date: TODAY,
        dueDate: addDays(TODAY, 14),
        reference: `${f.number} · ${f.entryNo}`,
        department: 'Logistics',
        notes: `Clearing & forwarding: ${f.goods}`,
        lines: [
          ...f.charges.map((x) => ({ id: uid('l'), description: `Disbursement — ${x.type}`, account: '4100', qty: 1, price: x.amount, vat: false })),
          ...(fee > 0 ? [{ id: uid('l'), description: `Agency fee ${f.feePct}%`, account: '4100', qty: 1, price: fee, vat: true }] : [])
        ]
      },
      c.actor.name
    );
    if (!r.ok || !r.id) return r;
    const g = get();
    commit({ ...g, clearance: g.clearance.map((x) => (x.id === id ? { ...x, invoiceId: r.id, history: [...x.history, log('Invoiced', `${disb.toLocaleString()} + fee ${fee.toLocaleString()}`)] } : x)) });
    return done('Client invoiced', `${f.number}: draft invoice in Finance`);
  };

  /* ---------------- Alerts ---------------- */
  /** Expiring supplier documents and contracts, overdue update requests: notifies once per item per day. */
  const runAlerts = (manual = false): Result => {
    const s = get();
    const sent = new Set(s.alertsSent);
    const fresh: string[] = [];
    let n = 0;
    for (const { profile: p, doc, days } of expiringDocuments(s.suppliers, s.settings.docAlertDays)) {
      const key = `doc:${doc.id}:${TODAY}`;
      if (sent.has(key)) continue;
      fresh.push(key);
      n++;
      const what = `${doc.number} ${days < 0 ? `expired ${-days} days ago` : `expires in ${days} days`}`;
      if (p.partyId) c.notifySupplier(p.partyId, `Please renew your document: ${what}`, 'Upload the renewed certificate on the supplier portal', p.number, true);
      c.notifyRole('OFFICER', `${p.name}: ${what}`, undefined, p.number);
    }
    for (const { c: ct, days } of contractsExpiring(s.contracts, s.settings.contractAlertDays)) {
      const key = `ct:${ct.id}:${TODAY}`;
      if (sent.has(key)) continue;
      fresh.push(key);
      n++;
      c.notifyRole('MANAGER', `Contract ${ct.number} ends in ${days} days`, `${ct.title} — renew, re-tender or let it lapse`, ct.number);
    }
    for (const p of s.suppliers) {
      const u = overdueUpdate(p);
      const key = u ? `upd:${u.id}:${TODAY}` : '';
      if (!u || sent.has(key)) continue;
      fresh.push(key);
      n++;
      if (p.partyId) c.notifySupplier(p.partyId, `Reminder: update your details (due ${u.due})`, 'Orders and invoices are on hold until you respond', p.number, true);
    }
    if (fresh.length) commit({ ...get(), alertsSent: [...s.alertsSent, ...fresh] });
    return manual ? done('Alerts run', n ? `${n} reminder(s) sent` : 'Nothing new to remind about') : { ok: true };
  };

  return {
    savePlanLine,
    removePlanLine,
    submitPlan,
    decidePlan,
    setReqExt,
    setPoCurrency,
    saveRule,
    toggleRule,
    addAdHoc,
    completeAdHoc,
    pendingAdHoc,
    saveReport,
    deleteReport,
    saveTemplate,
    saveBranding,
    sign,
    saveSettings,
    createLanded,
    addLandedCharge,
    removeLandedCharge,
    allocate,
    postLanded,
    createClearance,
    tickMilestone,
    addClearanceCharge,
    invoiceClearance,
    runAlerts
  };
};
