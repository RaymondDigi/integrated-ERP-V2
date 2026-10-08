import { TODAY } from '../../../../finance/engine';
import type { ESignature } from '../../../../../platform/Widgets';
import type { Ctx, Result } from '../ctx';
import { approveSteps, mergeTags, ruleFor } from '../engine';
import type { Clause, Contract, ContractItem, ContractSite, ContractTemplate, ContractType } from '../types';

export interface ContractDraft {
  title: string;
  supplierId: string;
  type: ContractType;
  start: string;
  end: string;
  valueCap: number;
  items: ContractItem[];
  sites: ContractSite[];
  customFields: Record<string, string>;
  retentionYears: number;
  access: Contract['access'];
  templateId?: string;
}

export const contractActions = (c: Ctx) => {
  const { get, commit, fail, done, log, uid, next, now } = c;
  const find = (id: string) => get().contracts.find((x) => x.id === id);
  const setC = (id: string, patch: (x: Contract) => Partial<Contract>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, contracts: s.contracts.map((x) => (x.id === id ? { ...x, ...patch(x), history: [...x.history, log(action, note)] } : x)) });
  };
  const buyer = () => c.actor.role !== 'STOREKEEPER';
  const validate = (d: ContractDraft) => {
    if (!d.title.trim()) return 'Give the contract a title';
    if (!d.supplierId) return 'Choose the supplier';
    if (!d.start || !d.end || d.end <= d.start) return 'The contract must end after it starts';
    if (d.valueCap < 0) return 'The value cap cannot be negative';
    if (d.items.some((i) => !i.sku || !(i.unitPrice > 0))) return 'Every contract item needs an item and a unit price';
    if (new Set(d.items.map((i) => i.sku)).size !== d.items.length) return 'An item appears twice — one price per item';
    if (d.items.some((i) => i.qtyCap !== undefined && i.qtyCap < 0)) return 'Quantity caps cannot be negative';
    const prof = get().suppliers.find((p) => p.partyId === d.supplierId);
    if (prof && prof.status !== 'APPROVED') return `${prof.name} is not an approved supplier`;
    return null;
  };
  const fields = (d: { title: string; supplierId: string; start: string; end: string; valueCap: number }) => ({ supplier: c.party(d.supplierId)?.name ?? '', title: d.title, start: d.start, end: d.end, value: `KES ${d.valueCap.toLocaleString()}` });

  const create = (d: ContractDraft): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Contracts are drafted by Purchasing');
    const p = validate(d);
    if (p) return fail(p);
    const s = get();
    const tpl = s.contractTemplates.find((t) => t.id === d.templateId);
    const { number, sequence } = next(s, 'CT');
    const ct: Contract = {
      ...d,
      id: uid('ct'),
      number,
      title: d.title.trim(),
      status: 'DRAFT',
      version: 1,
      versions: [{ n: 1, body: tpl ? mergeTags(tpl.body, fields(d)) : `${d.title}\n\nBetween the Company and ${c.party(d.supplierId)?.name}.`, by: c.actor.name, at: now(), note: tpl ? `From template "${tpl.name}"` : 'First draft' }],
      comments: [],
      signatures: [],
      risks: [],
      approvals: [],
      preparedBy: c.actor.name,
      history: [log(tpl ? 'Drafted from template' : 'Drafted', tpl?.name)]
    };
    commit({ ...s, sequence, contracts: [ct, ...s.contracts] });
    return done('Contract drafted', `${number} — ${ct.title}`, ct.id);
  };

  const update = (id: string, d: Partial<ContractDraft>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct) return fail('Contract not found');
    if (ct.status !== 'DRAFT') return fail('Only drafts can be edited — amend rates on a live contract instead');
    const p = validate({ ...ct, ...d });
    if (p) return fail(p);
    setC(id, () => d, 'Details edited');
    return done('Contract saved', ct.number, id);
  };

  /** Saves a new text version. Fails if someone else saved since you started (optimistic check). */
  const saveVersion = (id: string, body: string, baseVersion: number, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct) return fail('Contract not found');
    if (ct.status !== 'DRAFT') return fail('The text is locked once the contract goes for approval');
    if (baseVersion !== ct.version) return fail(`Version ${ct.version} was saved by ${ct.versions[ct.versions.length - 1].by} while you were editing version ${baseVersion} — review their changes and merge`);
    if (body.trim() === ct.versions[ct.versions.length - 1].body.trim()) return fail('No changes to save');
    const n = ct.version + 1;
    setC(id, (x) => ({ version: n, versions: [...x.versions, { n, body, by: c.actor.name, at: now(), note: note.trim() || 'Edited' }] }), `Version ${n} saved`, note || undefined);
    return done('Version saved', `${ct.number} v${n}`);
  };

  const comment = (id: string, text: string, internal: boolean, by?: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!text.trim()) return fail('Write a comment');
    setC(id, (x) => ({ comments: [...x.comments, { id: uid('cc'), by: by ?? c.actor.name, at: now(), text: text.trim(), internal }] }), internal ? 'Internal comment' : 'Comment shared with supplier');
    return { ok: true };
  };

  const addRisk = (id: string, text: string, level: 'LOW' | 'MEDIUM' | 'HIGH', mitigation: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!text.trim()) return fail('Describe the risk');
    setC(id, (x) => ({ risks: [...x.risks, { id: uid('rk'), text: text.trim(), level, mitigation }] }), `Risk logged (${level.toLowerCase()})`, text);
    return { ok: true };
  };

  const submit = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct || ct.status !== 'DRAFT') return fail('Only drafts can be submitted');
    if (!ct.items.length && ct.type !== 'SERVICE' && ct.type !== 'MASTER') return fail('Add the contract items and prices');
    setC(id, () => ({ status: 'APPROVAL', approvals: [] }), 'Submitted for approval');
    const step = approveSteps(ruleFor(get().rules, 'CONTRACT', ct.valueCap))[0];
    if (step) c.notifyRole(step.role, `Contract to approve: ${ct.number}`, ct.title, ct.number);
    return done('Submitted', `${ct.number} is waiting for approval`);
  };

  const stepsFor = (ct: Contract) => approveSteps(ruleFor(get().rules, 'CONTRACT', ct.valueCap));
  const fullyApproved = (ct: Contract) => ct.approvals.length >= Math.max(1, stepsFor(ct).length);

  const approve = (id: string, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct || ct.status !== 'APPROVAL') return fail('Nothing to approve');
    if (fullyApproved(ct)) return fail('Already approved — it is waiting for signature');
    const steps = stepsFor(ct);
    const need = steps[ct.approvals.length]?.role ?? 'MANAGER';
    if (c.actor.role !== need) return fail(`The next approval is for the ${need === 'DIRECTOR' ? 'Finance Director' : 'Commercial Manager'}`);
    if (ct.preparedBy === c.actor.name) return fail('You drafted this contract, so someone else must approve it');
    setC(id, (x) => ({ approvals: [...x.approvals, { by: c.actor.name, role: c.actor.role, at: now(), note: note || undefined }] }), 'Approved', note || undefined);
    return done('Approved', fullyApproved(find(id)!) ? `${ct.number} is ready to sign` : `${ct.number} needs the next approver`);
  };

  const reject = (id: string, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!note.trim()) return fail('Say what needs to change');
    const ct = find(id);
    if (!ct || ct.status !== 'APPROVAL') return fail('Nothing to reject');
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Only an approver can return a contract');
    setC(id, () => ({ status: 'DRAFT', approvals: [] }), 'Returned for changes', note);
    return done('Returned', ct.number);
  };

  /** Company signature (typed name + PIN). Becomes active once fully approved and signed. */
  const sign = (id: string, sig: ESignature): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct || ct.status !== 'APPROVAL') return fail('Only approved contracts are signed');
    if (!fullyApproved(ct)) return fail('Finish the approvals before signing');
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Contracts are signed by the Commercial Manager or Finance Director');
    setC(id, (x) => ({ signatures: [...x.signatures, sig], status: 'ACTIVE' }), 'Signed and activated', sig.meaning);
    c.notifySupplier(ct.supplierId, `Contract ${ct.number} signed`, `${ct.title} is active from ${ct.start} to ${ct.end}.`, ct.number);
    return done('Contract active', `${ct.number} signed by ${sig.by}`);
  };

  /** Dynamic rate update on a live contract (new version, audited). */
  const amendRates = (id: string, items: ContractItem[], reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Rate changes on a live contract need the Commercial Manager');
    if (!reason.trim()) return fail('Give the reason for the rate change');
    const ct = find(id);
    if (!ct || ct.status !== 'ACTIVE') return fail('Only active contracts take rate amendments');
    if (items.some((i) => !i.sku || !(i.unitPrice > 0))) return fail('Every item needs a price above zero');
    const changes = items
      .map((i) => {
        const old = ct.items.find((x) => x.sku === i.sku);
        return old ? (old.unitPrice !== i.unitPrice ? `${i.sku} ${old.unitPrice.toLocaleString()} → ${i.unitPrice.toLocaleString()}` : '') : `${i.sku} added at ${i.unitPrice.toLocaleString()}`;
      })
      .filter(Boolean);
    if (!changes.length) return fail('No rate changes');
    const n = ct.version + 1;
    const last = ct.versions[ct.versions.length - 1].body;
    setC(id, (x) => ({ items, version: n, versions: [...x.versions, { n, body: `${last}\n\nRate amendment ${TODAY}: ${changes.join('; ')}`, by: c.actor.name, at: now(), note: reason }] }), 'Rates amended', `${changes.join('; ')} — ${reason}`);
    return done('Rates updated', changes.join('; '));
  };

  const renew = (id: string, end: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Renewals are approved by the Commercial Manager');
    const ct = find(id);
    if (!ct || (ct.status !== 'ACTIVE' && ct.status !== 'EXPIRED')) return fail('Only active or expired contracts can be renewed');
    if (!end || end <= ct.end) return fail('The new end date must be after the current one');
    setC(id, () => ({ end, status: 'ACTIVE' }), 'Renewed', `${ct.end} → ${end}${reason ? ` · ${reason}` : ''}`);
    return done('Contract renewed', `${ct.number} now runs to ${end}`);
  };

  const terminate = (id: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Only the Commercial Manager or Finance Director can terminate a contract');
    if (!reason.trim()) return fail('Give the reason');
    const ct = find(id);
    if (!ct || ct.status !== 'ACTIVE') return fail('Only active contracts can be terminated');
    setC(id, () => ({ status: 'TERMINATED' }), 'Terminated', reason);
    c.notifySupplier(ct.supplierId, `Contract ${ct.number} terminated`, reason, ct.number);
    return done('Contract terminated', ct.number);
  };

  const archive = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const ct = find(id);
    if (!ct || (ct.status !== 'EXPIRED' && ct.status !== 'TERMINATED')) return fail('Only expired or terminated contracts are archived');
    setC(id, () => ({ archived: true }), 'Archived', `Kept for ${ct.retentionYears} years`);
    return { ok: true };
  };

  const saveTemplate = (t: Omit<ContractTemplate, 'id'> & { id?: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!t.name.trim() || !t.body.trim()) return fail('Name the template and write its text');
    const s = get();
    const rec = { ...t, id: t.id || uid('ctpl') } as ContractTemplate;
    commit({ ...s, contractTemplates: [...s.contractTemplates.filter((x) => x.id !== rec.id), rec] });
    return done('Template saved', t.name, rec.id);
  };
  const saveClause = (cl: Omit<Clause, 'id'> & { id?: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!cl.title.trim() || !cl.body.trim()) return fail('Give the clause a title and text');
    const s = get();
    const rec = { ...cl, id: cl.id || uid('cl') } as Clause;
    commit({ ...s, clauses: [...s.clauses.filter((x) => x.id !== rec.id), rec] });
    return done('Clause saved', cl.title);
  };

  return { create, update, saveVersion, comment, addRisk, submit, approve, reject, sign, amendRates, renew, terminate, archive, saveTemplate, saveClause, fullyApproved, stepsFor };
};
