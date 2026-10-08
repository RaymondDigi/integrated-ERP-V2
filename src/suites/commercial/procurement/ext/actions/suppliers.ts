import { addDays, TODAY } from '../../../../finance/engine';
import { auditChanges } from '../../../../../platform/audit';
import { notify } from '../../../../../platform/outbox';
import type { Ctx, Result } from '../ctx';
import { approveSteps, duplicateProblems, FIELD_LABEL, missingFields, PIN_RE, ruleFor } from '../engine';
import type { Asn, DocType, SupplierCatalogueItem, SupplierCore, SupplierDocument, SupplierEvaluation, SupplierProfile, SupplierStatus, SupplierType } from '../types';

export type SupplierDraft = Partial<SupplierCore> & { supplierType: SupplierType; category: string; parentId?: string; logo?: string };

const blankCore = (): SupplierCore => ({
  name: '',
  idType: 'KRA_PIN',
  idNumber: '',
  email: '',
  phone: '',
  contactPerson: '',
  country: 'Kenya',
  region: '',
  address: '',
  paymentMethod: 'EFT',
  paymentTerms: 30,
  bank: { bank: '', branch: '', account: '' },
  taxonomy: []
});

export const supplierActions = (c: Ctx) => {
  const { get, commit, fail, done, log, uid, next, now } = c;
  const prof = (id: string) => get().suppliers.find((p) => p.id === id);
  const setProf = (id: string, patch: (p: SupplierProfile) => Partial<SupplierProfile>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, suppliers: s.suppliers.map((p) => (p.id === id ? { ...p, ...patch(p), history: [...p.history, log(action, note)] } : p)) });
  };
  const configFor = (category: string) => get().formConfig.find((f) => f.category === category) ?? get().formConfig.find((f) => f.category === 'Default') ?? { category: 'Default', required: ['name'] as (keyof SupplierCore)[], documents: [] as DocType[] };
  const idProblem = (p: Partial<SupplierCore>) => (p.idType === 'KRA_PIN' && p.idNumber && !PIN_RE.test(p.idNumber.toUpperCase()) ? 'A KRA PIN is a letter, nine digits and a letter, e.g. P051234567X' : null);
  const isBuyer = () => c.actor.role === 'OFFICER' || c.actor.role === 'MANAGER' || c.actor.role === 'DIRECTOR';

  const create = (d: SupplierDraft, status: SupplierStatus, source: SupplierProfile['source'], extra: Partial<SupplierProfile> = {}): Result => {
    const s = get();
    const core = { ...blankCore(), ...d, name: (d.name ?? '').trim(), idNumber: (d.idNumber ?? '').trim().toUpperCase() };
    if (!core.name) return fail('Enter the supplier name');
    const idp = idProblem(core);
    if (idp) return fail(idp);
    const dups = duplicateProblems(core, s.suppliers, c.fin.state.parties);
    if (dups.length) return fail(dups[0]);
    const { number, sequence } = next(s, 'SUP');
    const p: SupplierProfile = {
      ...core,
      id: uid('sp'),
      number,
      supplierType: d.supplierType,
      category: d.category,
      parentId: d.parentId,
      logo: d.logo,
      status,
      source,
      documents: [],
      verification: {},
      updateRequests: [],
      approvals: [],
      preparedBy: source === 'PORTAL' ? 'Supplier portal' : c.actor.name,
      history: [log(source === 'PORTAL' ? 'Registered on the supplier portal' : source === 'REQUISITIONER' ? 'Suggested as a new supplier' : source === 'MIGRATION' ? 'Migrated from the old system' : 'Onboarding requested')],
      ...extra
    };
    commit({ ...s, sequence, suppliers: [p, ...s.suppliers] });
    return { ok: true, id: p.id };
  };

  /** Buyer starts onboarding, or a requisitioner suggests a supplier. */
  const requestOnboarding = (d: SupplierDraft, source: 'INTERNAL' | 'REQUISITIONER' = 'INTERNAL', reason = ''): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!d.email?.trim() && !d.phone?.trim()) return fail('Give an email or phone number so the supplier can be invited to register');
    const r = create(d, 'PROSPECT', source);
    if (!r.ok) return r;
    if (reason.trim()) setProf(r.id!, () => ({}), 'Reason', reason);
    c.notifyRole('OFFICER', `New supplier request: ${d.name}`, reason || `${d.category} · ${d.supplierType}`, get().suppliers.find((x) => x.id === r.id)?.number);
    if (d.email) notify({ module: 'Procurement', to: d.name ?? 'Supplier', address: d.email, subject: 'Register as a supplier', body: 'Please complete your registration on our supplier portal.', channels: ['EMAIL'] });
    return done(source === 'REQUISITIONER' ? 'Supplier suggested' : 'Onboarding started', `${d.name} added as a potential supplier`, r.id);
  };

  /** Supplier self-registration on the portal (simulated login record; real credentials need a backend). */
  const register = (d: SupplierDraft, username: string, accepted: boolean): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!accepted) return fail('Accept the supplier terms and conditions to register');
    if (!username.trim() || !username.includes('@')) return fail('Use your email address as the portal username');
    const missing = missingFields({ ...blankCore(), ...d }, configFor(d.category).required);
    if (missing.length) return fail(`Complete the required fields: ${missing.map((m) => FIELD_LABEL[m]).join(', ')}`);
    if (get().suppliers.some((p) => p.portalLogin?.username.toLowerCase() === username.trim().toLowerCase())) return fail('That username is already registered — sign in instead');
    const r = create(d, 'PENDING_APPROVAL', 'PORTAL', { termsAccepted: now(), portalLogin: { username: username.trim(), createdAt: now(), active: false } });
    if (!r.ok) return r;
    setProf(r.id!, () => ({}), 'Submitted for approval');
    c.notifyRole('MANAGER', `Supplier registration to approve: ${d.name}`, `${d.supplierType} · ${d.category}`);
    return done('Registration received', 'The procurement team will review it — your login activates once approved', r.id);
  };

  const saveProfile = (id: string, patch: Partial<SupplierDraft>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!isBuyer()) return fail('Supplier records are maintained by Purchasing');
    const p = prof(id);
    if (!p) return fail('Supplier not found');
    if (p.status === 'TERMINATED') return fail('Terminated suppliers cannot be edited');
    if (p.status === 'APPROVED' && patch.bank && JSON.stringify(patch.bank) !== JSON.stringify(p.bank)) return fail('Bank details of an approved supplier change only through an approved update request');
    const merged = { ...p, ...patch, idNumber: (patch.idNumber ?? p.idNumber).toUpperCase() };
    const idp = idProblem(merged);
    if (idp) return fail(idp);
    const dups = duplicateProblems(merged, get().suppliers, c.fin.state.parties);
    if (dups.length) return fail(dups[0]);
    auditChanges('Procurement', c.actor.name, p.number, p as unknown as Record<string, unknown>, merged as unknown as Record<string, unknown>, ['name', 'email', 'phone', 'contactPerson', 'region', 'paymentMethod', 'paymentTerms', 'category', 'supplierType']);
    setProf(id, () => merged, 'Profile edited');
    if (p.partyId && (patch.email || patch.phone || patch.name || patch.paymentTerms)) {
      const party = c.party(p.partyId);
      if (party) c.fin.saveParty({ ...party, name: merged.name, email: merged.email, phone: merged.phone, terms: merged.paymentTerms });
    }
    return done('Supplier saved', p.name, id);
  };

  const submit = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const p = prof(id);
    if (!p) return fail('Supplier not found');
    if (p.status !== 'PROSPECT' && p.status !== 'REJECTED') return fail('Only potential suppliers can be submitted for approval');
    const cfg = configFor(p.category);
    const missing = missingFields(p, cfg.required);
    if (missing.length) return fail(`Mandatory for ${cfg.category}: ${missing.map((m) => FIELD_LABEL[m]).join(', ')}`);
    const docs = cfg.documents.filter((t) => !p.documents.some((d) => d.type === t && d.expiry >= TODAY));
    if (docs.length) return fail(`Upload the current ${docs.map((d) => d.replace(/_/g, ' ').toLowerCase()).join(', ')}`);
    setProf(id, () => ({ status: 'PENDING_APPROVAL', approvals: [] }), 'Submitted for approval');
    const steps = approveSteps(ruleFor(get().rules, 'SUPPLIER', 0, { supplierType: p.supplierType, category: p.category }));
    if (steps[0]) c.notifyRole(steps[0].role, `Approve supplier ${p.name}`, `${p.supplierType} · ${p.category}`, p.number);
    return done('Submitted', `${p.name} is waiting for approval`);
  };

  /** Approval follows the rule for the supplier type; the last approval creates the supplier in Finance. */
  const approve = (id: string, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const p = prof(id);
    if (!p || p.status !== 'PENDING_APPROVAL') return fail('Nothing to approve');
    const rule = ruleFor(get().rules, 'SUPPLIER', 0, { supplierType: p.supplierType, category: p.category });
    const steps = approveSteps(rule);
    const need = steps[p.approvals.length]?.role ?? 'MANAGER';
    if (c.actor.role !== need) return fail(`The next approval is for the ${need === 'DIRECTOR' ? 'Finance Director' : need === 'MANAGER' ? 'Commercial Manager' : need}`);
    if (p.preparedBy === c.actor.name) return fail('You requested this supplier, so someone else must approve it');
    if (p.approvals.some((a) => a.by === c.actor.name)) return fail('You have already approved this supplier');
    const approvals = [...p.approvals, { by: c.actor.name, role: c.actor.role, at: now(), note: note.trim() || undefined }];
    const final = approvals.length >= Math.max(1, steps.length);
    if (!final) {
      setProf(id, () => ({ approvals }), 'Approved', note || undefined);
      const nx = steps[approvals.length];
      if (nx) c.notifyRole(nx.role, `Approve supplier ${p.name}`, 'Second approval needed', p.number);
      return done('Approved', `${p.name} now needs the ${nx?.role === 'DIRECTOR' ? 'Finance Director' : 'next approver'}`);
    }
    let partyId = p.partyId;
    if (!partyId) {
      const r = c.fin.saveParty({ id: '', kind: 'SUPPLIER', name: p.name, pin: p.idType === 'KRA_PIN' ? p.idNumber : 'NON-RESIDENT', email: p.email, phone: p.phone, terms: p.paymentTerms, category: p.category });
      if (!r.ok) return r;
      partyId = c.fin.snapshot().parties.find((x) => x.kind === 'SUPPLIER' && x.name === p.name)?.id;
    }
    setProf(id, (x) => ({ status: 'APPROVED', approvals, partyId, portalLogin: x.portalLogin ? { ...x.portalLogin, active: true } : { username: x.email, createdAt: now(), active: true } }), 'Approved', note || undefined);
    for (const st of rule?.steps.filter((x) => x.kind === 'NOTIFY') ?? []) c.notifyRole(st.role, `New supplier approved: ${p.name}`, 'For your information', p.number);
    if (p.email) c.notifySupplier(partyId ?? '', 'Your supplier registration is approved', 'Your supplier portal login is now active.', p.number);
    return done('Supplier approved', `${p.name} is set up in Finance and can be ordered from`);
  };

  const reject = (id: string, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Only an approver can reject a supplier');
    if (!note.trim()) return fail('Give the reason so the supplier can be told');
    const p = prof(id);
    if (!p || p.status !== 'PENDING_APPROVAL') return fail('Nothing to reject');
    setProf(id, () => ({ status: 'REJECTED', approvals: [] }), 'Rejected', note);
    return done('Registration rejected', p.name);
  };

  /** Suspend, terminate or reactivate across procurement (no new orders, events or invoices while blocked). */
  const setStatus = (id: string, status: 'SUSPENDED' | 'TERMINATED' | 'APPROVED', reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Only the Commercial Manager or Finance Director can change a supplier’s status');
    if (!reason.trim()) return fail('Give the reason');
    const p = prof(id);
    if (!p) return fail('Supplier not found');
    if (status === 'APPROVED' && p.status !== 'SUSPENDED') return fail('Only suspended suppliers can be reactivated');
    if (status !== 'APPROVED' && p.status !== 'APPROVED' && !(status === 'TERMINATED' && p.status === 'SUSPENDED')) return fail('Only approved or suspended suppliers can be blocked');
    const openPos = c.com.state.purchaseOrders.filter((o) => o.supplierId === p.partyId && o.status === 'APPROVED' && !o.closed).length;
    setProf(id, (x) => ({ status, portalLogin: x.portalLogin ? { ...x.portalLogin, active: status === 'APPROVED' } : undefined }), status === 'APPROVED' ? 'Reactivated' : status === 'SUSPENDED' ? 'Suspended' : 'Marked for termination', reason);
    return done(status === 'APPROVED' ? 'Supplier reactivated' : status === 'SUSPENDED' ? 'Supplier suspended' : 'Supplier terminated', openPos ? `${p.name} — ${openPos} open order(s) still to close out` : p.name);
  };

  const addDocument = (id: string, d: Omit<SupplierDocument, 'id' | 'verified'>, fromSupplier = false): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!d.number.trim()) return fail('Enter the certificate number');
    if (!d.expiry) return fail('Enter the expiry date');
    if (d.issued && d.expiry <= d.issued) return fail('Expiry must be after the issue date');
    const p = prof(id);
    if (!p) return fail('Supplier not found');
    setProf(id, (x) => ({ documents: [...x.documents.filter((o) => !(o.type === d.type && o.number === d.number)), { ...d, id: uid('doc'), verified: false }] }), `${d.type.replace(/_/g, ' ').toLowerCase()} uploaded`, fromSupplier ? 'By the supplier' : undefined);
    return done('Document added', `${d.number}, expires ${d.expiry}`);
  };
  const verifyDocument = (id: string, docId: string): Result => {
    if (!isBuyer()) return fail('Purchasing verifies documents');
    setProf(id, (x) => ({ documents: x.documents.map((d) => (d.id === docId ? { ...d, verified: true } : d)) }), 'Document verified');
    return { ok: true };
  };
  const toggleCheck = (id: string, item: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!isBuyer()) return fail('Purchasing completes verification');
    setProf(id, (x) => ({ verification: { ...x.verification, [item]: !x.verification[item] } }), `Verification: ${item}`);
    return { ok: true };
  };

  const sendUpdateRequest = (id: string, formCategory: string, days: number, message: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!isBuyer()) return fail('Purchasing sends update requests');
    const p = prof(id);
    if (!p || p.status !== 'APPROVED') return fail('Update forms go to approved suppliers');
    if (p.updateRequests.some((u) => u.status === 'SENT' || u.status === 'SUBMITTED' || u.status === 'UNDER_REVIEW')) return fail('An update request is already open for this supplier');
    if (!(days > 0)) return fail('Give the supplier a number of days to respond');
    setProf(id, (x) => ({ updateRequests: [...x.updateRequests, { id: uid('ur'), formCategory, status: 'SENT', sentAt: now(), due: addDays(TODAY, days), sentBy: c.actor.name, changes: {}, comments: [log('Sent', message || undefined)] }] }), 'Update form sent', `Due in ${days} days`);
    if (p.partyId) c.notifySupplier(p.partyId, 'Please update your supplier details', `${message || 'Confirm your details on the supplier portal.'} Invoices are held until you respond.`, p.number, true);
    return done('Update form sent', `${p.name} has ${days} days to respond`);
  };

  /** Supplier completes the update form on the portal. */
  const submitUpdate = (id: string, reqId: string, changes: Partial<SupplierCore>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const p = prof(id);
    const u = p?.updateRequests.find((x) => x.id === reqId);
    if (!p || !u) return fail('Update request not found');
    if (u.status !== 'SENT' && u.status !== 'REJECTED') return fail('This form has already been submitted');
    const merged = { ...p, ...changes };
    const missing = missingFields(merged, configFor(u.formCategory).required);
    if (missing.length) return fail(`Complete the required fields: ${missing.map((m) => FIELD_LABEL[m]).join(', ')}`);
    const idp = idProblem(merged);
    if (idp) return fail(idp);
    const dups = duplicateProblems(merged, get().suppliers, c.fin.state.parties);
    if (dups.length) return fail(dups[0]);
    setProf(id, (x) => ({ updateRequests: x.updateRequests.map((r) => (r.id === reqId ? { ...r, status: 'SUBMITTED', changes, comments: [...r.comments, { at: now(), by: `${p.contactPerson || p.name} (supplier)`, action: 'Submitted' }] } : r)) }), 'Update form submitted by the supplier');
    const steps = approveSteps(ruleFor(get().rules, 'SUPPLIER_UPDATE', 0));
    c.notifyRole(steps[0]?.role ?? 'MANAGER', `Supplier update to verify: ${p.name}`, Object.keys(changes).join(', '), p.number);
    return done('Update submitted', 'The procurement team will verify and approve it');
  };

  const decideUpdate = (id: string, reqId: string, approve: boolean, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const p = prof(id);
    const u = p?.updateRequests.find((x) => x.id === reqId);
    if (!p || !u) return fail('Update request not found');
    if (u.status !== 'SUBMITTED' && u.status !== 'UNDER_REVIEW') return fail('Only submitted forms can be decided');
    if (!approve && !note.trim()) return fail('Tell the supplier what to correct');
    const steps = approveSteps(ruleFor(get().rules, 'SUPPLIER_UPDATE', 0));
    const need = steps[0]?.role ?? 'MANAGER';
    if (approve && c.actor.role !== need && c.actor.role !== 'DIRECTOR') return fail(`Supplier updates are approved by the ${need === 'MANAGER' ? 'Commercial Manager' : need}`);
    if (!approve && !isBuyer()) return fail('Purchasing reviews supplier updates');
    if (!approve) {
      setProf(id, (x) => ({ updateRequests: x.updateRequests.map((r) => (r.id === reqId ? { ...r, status: 'REJECTED', comments: [...r.comments, log('Returned to supplier', note)] } : r)) }), 'Update returned to the supplier', note);
      if (p.partyId) c.notifySupplier(p.partyId, 'Your update needs correcting', note, p.number);
      return done('Returned to supplier', p.name);
    }
    const merged = { ...p, ...u.changes };
    auditChanges('Procurement', c.actor.name, p.number, p as unknown as Record<string, unknown>, merged as unknown as Record<string, unknown>, ['name', 'email', 'phone', 'contactPerson', 'region', 'address', 'paymentMethod', 'paymentTerms']);
    if (u.changes.bank) auditChanges('Procurement', c.actor.name, p.number, p.bank as unknown as Record<string, unknown>, u.changes.bank as unknown as Record<string, unknown>);
    setProf(id, (x) => ({ ...u.changes, updateRequests: x.updateRequests.map((r) => (r.id === reqId ? { ...r, status: 'APPROVED', comments: [...r.comments, log('Approved', note || undefined)] } : r)) }), 'Supplier update approved', note || undefined);
    if (p.partyId) {
      const party = c.party(p.partyId);
      if (party) c.fin.saveParty({ ...party, name: merged.name, email: merged.email, phone: merged.phone, terms: merged.paymentTerms });
    }
    return done('Update applied', `${p.name}: changes are live and invoicing is unblocked`);
  };
  const markUnderReview = (id: string, reqId: string): Result => {
    if (!isBuyer()) return fail('Purchasing reviews supplier updates');
    setProf(id, (x) => ({ updateRequests: x.updateRequests.map((r) => (r.id === reqId && r.status === 'SUBMITTED' ? { ...r, status: 'UNDER_REVIEW', comments: [...r.comments, log('Under review')] } : r)) }), 'Update under review');
    return { ok: true };
  };

  const evaluate = (e: Omit<SupplierEvaluation, 'id' | 'evaluator' | 'at'>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!isBuyer()) return fail('Supplier evaluations are done by Purchasing');
    if (Object.values(e.scores).some((v) => !(v >= 1 && v <= 5))) return fail('Score every criterion from 1 to 5');
    if (!e.period.trim()) return fail('Which period is this for?');
    const s = get();
    if (s.evaluations.some((x) => x.supplierId === e.supplierId && x.period === e.period && x.evaluator === c.actor.name)) return fail(`You have already evaluated this supplier for ${e.period}`);
    commit({ ...s, evaluations: [{ ...e, id: uid('se'), evaluator: c.actor.name, at: now() }, ...s.evaluations] });
    return done('Evaluation saved', e.period);
  };

  /** Go-live migration of supplier master data from the old system. */
  const importSuppliers = (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    if (c.readOnly()) return { imported: 0, errors: [c.readOnly()!] };
    let imported = 0;
    rows.forEach((r, i) => {
      const d: SupplierDraft = {
        name: r.name,
        idType: (r.id_type as SupplierCore['idType']) || 'KRA_PIN',
        idNumber: r.id_number,
        email: r.email,
        phone: r.phone,
        contactPerson: r.contact,
        region: r.region,
        country: r.country || 'Kenya',
        paymentTerms: Number(r.terms) || 30,
        paymentMethod: (r.payment_method as SupplierCore['paymentMethod']) || 'EFT',
        bank: { bank: r.bank, branch: r.branch, account: r.account },
        taxonomy: r.category ? [r.category] : [],
        supplierType: (r.type as SupplierType) || 'GOODS',
        category: r.category || 'Materials'
      };
      if (!d.name?.trim()) return errors.push(`Row ${i + 2}: name is missing`);
      if (!d.idNumber?.trim()) return errors.push(`Row ${i + 2}: ${d.name} has no KRA PIN / ID number`);
      const idp = idProblem(d);
      if (idp) return errors.push(`Row ${i + 2}: ${idp}`);
      const dups = duplicateProblems(d, get().suppliers, c.fin.state.parties);
      if (dups.length) return errors.push(`Row ${i + 2}: ${dups[0]}`);
      const res = create(d, 'PROSPECT', 'MIGRATION');
      if (res.ok) imported++;
      else errors.push(`Row ${i + 2}: ${res.error}`);
    });
    if (imported) c.done('Suppliers migrated', `${imported} imported as potential suppliers — submit them for approval`);
    return { imported, errors };
  };

  const saveFormConfig = (category: string, required: (keyof SupplierCore)[], documents: DocType[]): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Supplier forms are configured by the Commercial Manager');
    if (!category.trim()) return fail('Name the supplier category');
    if (!required.includes('name')) return fail('Name is always mandatory');
    const s = get();
    commit({ ...s, formConfig: [...s.formConfig.filter((f) => f.category !== category), { category: category.trim(), required, documents }] });
    return done('Supplier form saved', `${category}: ${required.length} mandatory fields, ${documents.length} documents`);
  };

  /* ---------------- Supplier catalogue and ASNs (portal) ---------------- */
  const submitCatalogueItem = (it: Omit<SupplierCatalogueItem, 'id' | 'status' | 'submittedAt'>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!it.description.trim() || !it.supplierSku.trim()) return fail('Enter your item code and description');
    if (!(it.price > 0)) return fail('Enter a price above zero');
    const s = get();
    commit({ ...s, catalogue: [{ ...it, id: uid('sc'), status: 'PENDING', submittedAt: now() }, ...s.catalogue] });
    c.notifyRole('MANAGER', `Catalogue price to approve: ${c.party(it.supplierId)?.name}`, `${it.description} at ${it.price.toLocaleString()}`);
    return done('Submitted for approval', it.description);
  };
  const decideCatalogueItem = (id: string, approve: boolean): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const need = approveSteps(ruleFor(get().rules, 'CATALOGUE', 0))[0]?.role ?? 'MANAGER';
    if (c.actor.role !== need && c.actor.role !== 'DIRECTOR') return fail('Catalogue prices are approved by the Commercial Manager');
    const s = get();
    const it = s.catalogue.find((x) => x.id === id);
    if (!it || it.status !== 'PENDING') return fail('Nothing to decide');
    commit({ ...s, catalogue: s.catalogue.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: c.actor.name } : x)) });
    c.notifySupplier(it.supplierId, `Catalogue item ${approve ? 'approved' : 'rejected'}`, it.description);
    return done(approve ? 'Catalogue item approved' : 'Catalogue item rejected', it.description);
  };

  const submitAsn = (a: Omit<Asn, 'id' | 'number' | 'status' | 'at'>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const po = c.com.state.purchaseOrders.find((o) => o.id === a.poId);
    if (!po || po.supplierId !== a.supplierId) return fail('That order is not yours');
    if (!po.sentAt || po.status !== 'APPROVED' || po.closed) return fail('Only open orders that were sent to you can be shipped against');
    const lines = a.lines.filter((l) => l.qty > 0);
    if (!lines.length) return fail('Enter the quantities shipped');
    for (const l of lines) {
      const pl = po.lines.find((x) => x.id === l.lineId);
      if (!pl || l.qty > pl.qty - pl.received) return fail(`${pl?.description ?? 'Line'}: more than is outstanding`);
    }
    if (a.eta < a.shipDate) return fail('Arrival cannot be before shipping');
    if (!a.vehicle.trim()) return fail('Enter the vehicle or container number');
    const s = get();
    const { number, sequence } = next(s, 'ASN');
    commit({ ...s, sequence, asns: [{ ...a, lines, id: uid('asn'), number, status: 'SUBMITTED', at: now() }, ...s.asns] });
    c.notifyRole('STOREKEEPER', `${number}: ${c.party(a.supplierId)?.name} shipping ${po.number}`, `ETA ${a.eta} on ${a.vehicle}`, po.number);
    return done('Advance shipping notice sent', `${number} for ${po.number}`);
  };

  const setPortalSupplier = (partyId: string) => commit({ ...get(), portalSupplier: partyId });

  return { requestOnboarding, register, saveProfile, submit, approve, reject, setStatus, addDocument, verifyDocument, toggleCheck, sendUpdateRequest, submitUpdate, decideUpdate, markUnderReview, evaluate, importSuppliers, saveFormConfig, submitCatalogueItem, decideCatalogueItem, submitAsn, setPortalSupplier, configFor };
};
