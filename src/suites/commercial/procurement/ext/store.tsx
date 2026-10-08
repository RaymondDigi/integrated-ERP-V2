import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { useFinance } from '../../../finance/store';
import { localStamp, round2, TODAY } from '../../../finance/engine';
import { useOperations } from '../../../operations/store';
import { useAccess } from '../../../../platform/access';
import { notify } from '../../../../platform/outbox';
import { COM_ACTORS } from '../../data';
import { reqTotal, totals } from '../../engine';
import { useCommercial, type ProcurementPage } from '../../store';
import type { ComRole, PurchaseOrder, Requisition } from '../../types';
import type { Ctx, Result } from './ctx';
import { approveSteps, budgetPosition, contractFor, contractPrice, overdueUpdate, ruleFor } from './engine';
import { buildProcSeed } from './data';
import { prcHooks, type PrcCheck } from './hooks';
import { apActions } from './actions/ap';
import { contractActions } from './actions/contracts';
import { inventoryActions } from './actions/inventory';
import { planActions } from './actions/plan';
import { sourcingActions } from './actions/sourcing';
import { supplierActions } from './actions/suppliers';
import type { ProcExtState } from './types';

/** Procurement pages added beside the core requisition → order → receipt screens. */
export type ProcExtPage =
  | 'sourcing'
  | 'portal'
  | 'vendors'
  | 'contracts'
  | 'catalogue'
  | 'invoices'
  | 'inventory'
  | 'stores'
  | 'landed'
  | 'plan'
  | 'reports'
  | 'settings';

export const EXT_LABEL: Record<ProcExtPage, string> = {
  sourcing: 'Sourcing events',
  portal: 'Supplier portal',
  vendors: 'Supplier management',
  contracts: 'Contracts',
  catalogue: 'Shop & catalogue',
  invoices: 'Invoice matching',
  inventory: 'Inventory control',
  stores: 'Stores requests',
  landed: 'Landed cost & clearing',
  plan: 'Plan & budget',
  reports: 'Reports & analytics',
  settings: 'Procurement settings'
};

const PO_RULE = 'PO';
const docRef = (kind: 'requisitions' | 'purchaseOrders', id: string) => `${kind === 'requisitions' ? 'REQUISITION' : PO_RULE}:${id}`;

const useProcExtValue = () => {
  const com = useCommercial();
  const fin = useFinance();
  const ops = useOperations();
  const access = useAccess();
  const { addToast } = useApp();
  const [state, setState] = useState<ProcExtState>(() => buildProcSeed(com.state, fin.state));
  const ref = useRef(state);
  ref.current = state;
  const [page, setPage] = useState<{ page: ProcExtPage; focus: string | null } | null>(null);

  // Core procurement navigation (sidebar, overview, other modules) takes over from an extension page
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(null);
  }, [com.procurement]);

  const actor = com.state.actor;
  const commit = (next: ProcExtState) => {
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
  const warn = (title: string, message: string) => addToast({ type: 'warning', title, message });
  const party = (id: string) => fin.snapshot().parties.find((p) => p.id === id);

  const ctx: Ctx = {
    get: () => ref.current,
    commit,
    fail,
    done,
    warn,
    actor,
    readOnly: () => (access.canWrite ? null : 'This is a read-only account — you can view procurement but not change it'),
    com,
    fin,
    ops,
    log: (action, note) => ({ at: localStamp(), by: actor.name, action, note }),
    next: (s, prefix) => {
      const n = (s.sequence[prefix] ?? 0) + 1;
      return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
    },
    uid: (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    now: () => localStamp(),
    party,
    notifyRole: (role: ComRole, subject, body, refNo) => {
      notify({ module: 'Procurement', to: `${COM_ACTORS[role].name} (${COM_ACTORS[role].title})`, subject, body, ref: refNo });
    },
    notifySupplier: (supplierId, subject, body, refNo, sms) => {
      const p = party(supplierId);
      const prof = ref.current.suppliers.find((x) => x.partyId === supplierId);
      notify({ module: 'Procurement', to: p?.name ?? prof?.name ?? supplierId, address: p?.email || prof?.email, subject, body, ref: refNo, channels: sms ? ['EMAIL', 'SMS'] : ['EMAIL'] });
    }
  };

  const sourcing = sourcingActions(ctx);
  const suppliers = supplierActions(ctx);
  const contracts = contractActions(ctx);
  const ap = apActions(ctx);
  const inventory = inventoryActions(ctx);
  const plan = planActions(ctx);

  /* ---------------- Budget position for a requisition ---------------- */
  const accountOf = (sku: string) => com.snapshot().products.find((p) => p.sku === sku)?.account ?? '5000';
  const reqAccount = (reqId: string) => ref.current.reqExt[reqId]?.budgetAccount;
  const budgetFor = (r: Pick<Requisition, 'lines'> & { id?: string; number?: string }, accountOverride?: string) => {
    const account = accountOverride || (r.id && reqAccount(r.id)) || accountOf(r.lines[0]?.sku ?? '');
    const pos = budgetPosition(fin.snapshot(), fin.entries, com.snapshot(), account, accountOf, reqAccount, r.number);
    const value = round2(r.lines.reduce((a, l) => a + l.qty * l.estPrice, 0));
    return { ...pos, value, over: pos.hasBudget && value > pos.available };
  };
  const poCategory = (po: Pick<PurchaseOrder, 'lines'>) => com.snapshot().products.find((p) => p.sku === po.lines[0]?.sku)?.category;
  const profileOf = (partyId: string) => ref.current.suppliers.find((p) => p.partyId === partyId);
  const supplierBlock = (partyId: string, strict: boolean) => {
    const p = profileOf(partyId);
    if (!p) return null;
    if (p.status === 'SUSPENDED' || p.status === 'TERMINATED' || p.status === 'REJECTED') return `${p.name} is ${p.status.toLowerCase()} — no new orders can be placed with them`;
    if (p.status !== 'APPROVED') return `${p.name} is not an approved supplier yet — finish onboarding first`;
    if (strict) {
      const u = overdueUpdate(p);
      if (u) return `${p.name} has not answered the update request due ${u.due} — orders are on hold until they respond`;
    }
    return null;
  };
  /** Lines priced above a live contract, or bought off-contract while a contract for the item exists. */
  const offContract = (po: Pick<PurchaseOrder, 'supplierId' | 'lines'>) => {
    const s = ref.current;
    const out: string[] = [];
    for (const l of po.lines) {
      if (!l.sku) continue;
      const mine = contractPrice(s.contracts, po.supplierId, l.sku);
      if (mine && l.price > mine.price + 0.005) out.push(`${l.sku} at ${l.price.toLocaleString()} is above the ${mine.contract.number} price of ${mine.price.toLocaleString()}`);
      if (!mine) {
        const other = contractFor(s.contracts, undefined, l.sku);
        if (other) out.push(`${l.sku} is under contract ${other.number} with ${party(other.supplierId)?.name}`);
      }
    }
    return out;
  };
  const notifySteps = (doc: 'REQUISITION' | 'PO', value: number, number: string, category?: string) => {
    const rule = ruleFor(ref.current.rules, doc, value, { category });
    const steps = rule?.steps ?? [];
    const firstApprover = steps.find((x) => x.kind === 'APPROVE');
    if (firstApprover) ctx.notifyRole(firstApprover.role, `${number} is waiting for your approval`, rule?.name, number);
    for (const st of steps.filter((x) => x.kind === 'NOTIFY')) ctx.notifyRole(st.role, `For information: ${number} submitted`, rule?.name, number);
  };

  const check = (c: PrcCheck): string | null => {
    const s = ref.current;
    switch (c.action) {
      case 'saveRequisition':
        return null;
      case 'submitRequisition': {
        const b = budgetFor(c.req as Requisition);
        const req = c.req as Requisition;
        if (b.over) {
          warn('Over budget', `${req.number}: KES ${b.value.toLocaleString()} against KES ${b.available.toLocaleString()} available on ${b.account} — the Finance Director must also approve`);
          ctx.notifyRole('DIRECTOR', `Over-budget requisition ${req.number}`, `Needs KES ${b.value.toLocaleString()}, KES ${b.available.toLocaleString()} available on ${b.account}`, req.number);
        }
        notifySteps('REQUISITION', reqTotal(req), req.number);
        return null;
      }
      case 'approve': {
        const pending = plan.pendingAdHoc(docRef(c.kind, c.doc.id));
        if (pending.length) return `Waiting for ${pending.map((x) => x.name).join(', ')} to approve first (added to this document)`;
        if (c.kind === 'purchaseOrders') return supplierBlock((c.doc as PurchaseOrder).supplierId, false);
        return null;
      }
      case 'savePO':
        return supplierBlock(c.po.supplierId, false);
      case 'submitPO':
      case 'sendPO': {
        const blocked = supplierBlock(c.po.supplierId, true);
        if (blocked) return blocked;
        if (c.action === 'sendPO') {
          const pending = c.po.id ? plan.pendingAdHoc(docRef('purchaseOrders', c.po.id)) : [];
          if (pending.length) return `Waiting for ${pending.map((x) => x.name).join(', ')} to approve before it can be sent`;
          return null;
        }
        const po = c.po as PurchaseOrder;
        const off = offContract(po);
        if (off.length && !/off-contract:/i.test(po.notes ?? '')) return `${off[0]}. Buy on contract, or explain in the order notes starting "Off-contract:"`;
        notifySteps('PO', totals(po.lines, com.snapshot().products).total, po.number, poCategory(po));
        return null;
      }
      case 'award':
        return supplierBlock(c.supplierId, true);
      case 'bill':
        return ap.invoiceBlock(c.po.supplierId);
      default:
        void s;
        return null;
    }
  };

  // Seams into the core purchasing flow, refreshed every render with the latest state
  prcHooks.check = check;
  prcHooks.approvalPlan = (kind, doc, value) => {
    const isReq = kind === 'requisitions';
    const rule = ruleFor(ref.current.rules, isReq ? 'REQUISITION' : 'PO', value, { category: isReq ? undefined : poCategory(doc as PurchaseOrder) });
    const roles: string[] = approveSteps(rule).map((x) => x.role);
    if (isReq && budgetFor(doc as Requisition).over && !roles.includes('DIRECTOR')) roles.push('DIRECTOR');
    return roles.length ? roles : null;
  };
  prcHooks.autoApprove = (po) => {
    const s = ref.current;
    if (!s.settings.autoApproveOnContract || !po.lines.length) return null;
    const cts = po.lines.map((l) => (l.sku ? contractPrice(s.contracts, po.supplierId, l.sku) : null));
    if (cts.some((x, i) => !x || po.lines[i].price > x.price + 0.005)) return null;
    const numbers = [...new Set(cts.map((x) => x!.contract.number))];
    return `every line is on contract ${numbers.join(', ')} at the agreed price`;
  };
  prcHooks.unitFactor = (sku) => ref.current.items.find((i) => i.sku === sku)?.factor ?? 1;
  prcHooks.contractPrice = (supplierId, sku) => contractPrice(ref.current.contracts, supplierId, sku)?.price ?? null;
  prcHooks.after = (event, grn, po) => {
    if (event === 'received') inventory.recordReceipt(grn, po);
  };
  prcHooks.afterReject = (kind, doc, note) => {
    notify({ module: 'Procurement', to: doc.preparedBy, subject: `${doc.number} was returned`, body: note, ref: doc.number, level: 'warning', channels: ['IN_APP', 'EMAIL', 'SMS'] });
    void kind;
  };

  // Automatic reorder and expiry alerts
  const autoReorderOn = state.settings.autoReorder;
  const products = com.state.products;
  const reorderRef = useRef(inventory.autoReorder);
  reorderRef.current = inventory.autoReorder;
  const alertsRef = useRef(plan.runAlerts);
  alertsRef.current = plan.runAlerts;
  useEffect(() => {
    if (autoReorderOn) reorderRef.current(true);
  }, [autoReorderOn, products]);
  useEffect(() => {
    alertsRef.current(false);
  }, []);

  const go = useCallback((p: ProcExtPage, focus: string | null = null) => setPage({ page: p, focus }), []);
  const goCore = (p: ProcurementPage, focus: string | null = null) => {
    setPage(null);
    com.setProcurement(p, focus);
  };
  const reset = () => {
    commit(buildProcSeed(com.snapshot(), fin.snapshot()));
  };

  return { state, page, go, goCore, reset, actor, readOnly: !access.canWrite, budgetFor, offContract, supplierBlock, sourcing, suppliers, contracts, ap, inventory, plan, ctx };
};

type ProcExtValue = ReturnType<typeof useProcExtValue>;
const ProcExtContext = createContext<ProcExtValue | null>(null);

export const ProcurementExtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useProcExtValue();
  return <ProcExtContext.Provider value={value}>{children}</ProcExtContext.Provider>;
};

export const useProcurementExt = () => {
  const v = useContext(ProcExtContext);
  if (!v) throw new Error('useProcurementExt must be used inside ProcurementExtProvider');
  return v;
};
