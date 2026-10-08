import React, { createContext, useContext, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import { notify } from '../../../platform/outbox';
import { audit } from '../../../platform/audit';
import type { ESignature } from '../../../platform/Widgets';
import { addDays, localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { stockAt } from '../engine';
import type { OpsRole, Project } from '../types';
import { buildProjectsSeed } from './data';
import { criticalPath, projectShortages } from './projectEngine';
import { SPARES_STORE } from './engine';
import type { Appraisal, CostType, ExpenseClaim, ProjectExt, ProjectPhase, ProjectsState, ProjectTask } from './types';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useProjectsStore> | null>(null);

export const EXPENSE_ACCOUNT: Record<ExpenseClaim['category'], string> = { TRAVEL: '6300', PER_DIEM: '6300', ACCOMMODATION: '6300', OTHER: '6600' };

const useProjectsStore = () => {
  const { addToast } = useApp();
  const ops = useOperations();
  const access = useAccess();
  const [state, setState] = useState<ProjectsState>(buildProjectsSeed);
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;
  const products = ops.products;

  const commit = (next: ProjectsState) => {
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
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const log = (action: string, note?: string) => ({ at: localStamp(), by: actor.name, action, note });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  const guard = (...roles: OpsRole[]) => {
    if (!access.canWrite) return fail('This is a read-only account — sign in as a member or manager to make changes');
    if (roles.length && !is(...roles)) return fail(`This needs the ${roles.map((r) => r.toLowerCase().replace('_', ' ')).join(' or ')} role — switch who you are acting as`);
    return null;
  };
  const project = (id: string) => ops.snapshot().projects.find((p) => p.id === id)!;
  const ext = (id: string) => ref.current.ext[id];
  const patchExt = (id: string, patch: Partial<ProjectExt>, action?: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, ext: { ...s.ext, [id]: { ...s.ext[id], ...patch, history: action ? [...s.ext[id].history, log(action, note)] : s.ext[id].history } } });
  };
  const patchProject = (id: string, patch: Partial<Project>) => ops.mutate((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  /** Adds cost lines to the project ledger and to the project's spend. */
  const addCosts = (lines: { projectId: string; phaseId: string; type: CostType; amount: number; source: string; description: string; billable?: boolean }[]) => {
    const s = ref.current;
    commit({ ...s, costs: [...lines.map((l) => ({ ...l, id: uid('pc'), date: TODAY, amount: round2(l.amount) })), ...s.costs] });
    const byProject = new Map<string, number>();
    for (const l of lines) byProject.set(l.projectId, (byProject.get(l.projectId) ?? 0) + l.amount);
    ops.mutate((st) => ({ ...st, projects: st.projects.map((p) => (byProject.has(p.id) ? { ...p, spent: round2(p.spent + byProject.get(p.id)!) } : p)) }));
    for (const [pid, amt] of byProject) {
      const p = project(pid);
      if (p.spent > p.budget && p.spent - amt <= p.budget) addToast({ type: 'warning', title: 'Over budget', message: `${p.name} is now over its budget` });
    }
  };
  const isOwner = (p: Project) => p.owner === actor.name || is('MANAGER');

  /* ---------------- Project set-up ---------------- */
  const saveProject = (f: { id?: string; name: string; owner: string; budget: number; start: string; end: string; kind: ProjectExt['kind']; scope: string; customerId?: string; burdenRatePct: number; assetCategory?: string; team: ProjectExt['team'] }): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!f.name.trim() || !f.scope.trim()) return fail('Enter the project name and scope');
    if (!(f.budget > 0)) return fail('Enter the budget');
    if (!f.start || !f.end || f.end <= f.start) return fail('The end date must be after the start');
    if (f.kind === 'CUSTOMER' && !f.customerId) return fail('Choose the customer for a customer project');
    if (f.team.some((t) => t.name.trim() && !(t.allocationPct > 0 && t.allocationPct <= 100))) return fail('Team allocations are between 1% and 100%');
    if (!(f.burdenRatePct >= 0 && f.burdenRatePct <= 200)) return fail('Overhead rate is between 0% and 200%');
    const team = f.team.filter((t) => t.name.trim());
    if (f.id) {
      const p = project(f.id);
      if (p.status === 'DONE') return fail('The project is closed');
      patchProject(f.id, { name: f.name.trim(), owner: f.owner, budget: f.budget, start: f.start, end: f.end });
      patchExt(f.id, { kind: f.kind, scope: f.scope, customerId: f.customerId, burdenRatePct: f.burdenRatePct, assetCategory: f.assetCategory, team, budgetApprovedBy: p.budget !== f.budget ? undefined : ext(f.id).budgetApprovedBy }, 'Project updated', p.budget !== f.budget ? 'Budget changed — needs approval again' : undefined);
      return done('Project saved', f.name, f.id);
    }
    const id = uid('pj');
    const n = Object.keys(ref.current.ext).length + 1;
    ops.mutate((s) => ({ ...s, projects: [...s.projects, { id, name: f.name.trim(), owner: f.owner, budget: f.budget, spent: 0, start: f.start, end: f.end, status: 'PLANNING', milestones: [] }] }));
    const s = ref.current;
    commit({
      ...s,
      ext: {
        ...s.ext,
        [id]: { projectId: id, code: `PJ-${String(n).padStart(3, '0')}`, kind: f.kind, scope: f.scope, customerId: f.customerId, orderNumbers: [], team, burdenRatePct: f.burdenRatePct, assetCategory: f.assetCategory, phases: [], tasks: [], materials: [], benefits: [], certificates: [], invoices: [], history: [log('Project created')] }
      }
    });
    return done('Project created', `${f.name} — add phases and tasks, then submit the appraisal`, id);
  };
  /** Copies phases and tasks from another project as a template (dates shift to the new start). */
  const copyPlan = (toId: string, fromId: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const from = ext(fromId);
    const fp = project(fromId);
    const tp = project(toId);
    if (ext(toId).phases.length) return fail('This project already has a plan');
    const shift = (d: string) => addDays(tp.start, Math.max(0, (new Date(d).getTime() - new Date(fp.start).getTime()) / 86_400_000));
    patchExt(toId, { phases: from.phases.map((p) => ({ ...p, start: shift(p.start), end: shift(p.end) })), tasks: from.tasks.map((t) => ({ ...t, progress: 0, actualFinish: undefined, start: t.start ? shift(t.start) : undefined })) }, `Plan copied from ${from.code}`);
    return done('Plan copied', `${from.phases.length} phases and ${from.tasks.length} tasks`);
  };
  const savePhase = (projectId: string, ph: ProjectPhase): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!ph.name.trim()) return fail('Name the phase');
    if (!(ph.budget >= 0)) return fail('Enter the phase budget');
    if (!ph.start || !ph.end || ph.end < ph.start) return fail('The phase must end after it starts');
    const e = ext(projectId);
    const phases = ph.id && e.phases.some((x) => x.id === ph.id) ? e.phases.map((x) => (x.id === ph.id ? ph : x)) : [...e.phases, { ...ph, id: uid('ph') }];
    const total = phases.reduce((x, p) => x + p.budget, 0);
    patchExt(projectId, { phases }, ph.id ? `Phase ${ph.name} updated` : `Phase ${ph.name} added`);
    if (total > project(projectId).budget) addToast({ type: 'warning', title: 'Phases exceed the budget', message: `Phase budgets add up to ${total.toLocaleString()} KES against ${project(projectId).budget.toLocaleString()} KES` });
    return { ok: true };
  };
  const saveTask = (projectId: string, t: ProjectTask): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!t.name.trim() || !t.phaseId) return fail('Name the task and choose its phase');
    if (!(t.durationDays > 0)) return fail('Duration must be at least a day');
    if (!(t.progress >= 0 && t.progress <= 100)) return fail('Progress is between 0 and 100%');
    const e = ext(projectId);
    const rec = { ...t, id: t.id || uid('tk'), actualFinish: t.progress >= 100 ? (t.actualFinish ?? TODAY) : undefined };
    const tasks = t.id && e.tasks.some((x) => x.id === t.id) ? e.tasks.map((x) => (x.id === t.id ? rec : x)) : [...e.tasks, rec];
    if (criticalPath(tasks, project(projectId).start).cycle) return fail('Those predecessors make a loop — a task cannot depend on itself');
    patchExt(projectId, { tasks }, t.id ? `Task ${t.name} updated` : `Task ${t.name} added`, t.id ? `${t.progress}% done` : undefined);
    return { ok: true };
  };

  /* ---------------- Appraisal, budget and status ---------------- */
  const submitAppraisal = (projectId: string, a: Omit<Appraisal, 'preparedBy' | 'decision' | 'decidedBy' | 'note'>): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!(a.capex > 0) || !(a.annualBenefit >= 0) || !(a.lifeYears > 0) || !(a.ratePct > 0)) return fail('Enter the investment, yearly benefit, life and discount rate');
    if (project(projectId).status !== 'PLANNING') return fail('The appraisal is done before the project starts');
    patchExt(projectId, { appraisal: { ...a, preparedBy: actor.name } }, 'Appraisal submitted');
    notify({ module: 'Projects', to: 'Operations Manager', subject: `Appraisal for ${project(projectId).name} needs a decision`, ref: ext(projectId).code });
    return done('Appraisal submitted', 'The Operations Manager decides');
  };
  const decideAppraisal = (projectId: string, approve: boolean, note: string): Result => {
    const g = guard('MANAGER');
    if (g) return g;
    const a = ext(projectId).appraisal;
    if (!a) return fail('No appraisal submitted');
    if (a.decision) return fail('Already decided');
    if (a.preparedBy === actor.name) return fail('You prepared the appraisal, so someone else must decide');
    if (!approve && !note.trim()) return fail('Give a reason for rejecting');
    patchExt(projectId, { appraisal: { ...a, decision: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor.name, note } }, approve ? 'Appraisal approved' : 'Appraisal rejected', note || undefined);
    audit({ module: 'Projects', by: actor.name, action: approve ? 'Appraisal approved' : 'Appraisal rejected', ref: ext(projectId).code, note });
    return done(approve ? 'Appraisal approved' : 'Appraisal rejected', project(projectId).name);
  };
  const approveBudget = (projectId: string): Result => {
    const g = guard('MANAGER');
    if (g) return g;
    const p = project(projectId);
    if (p.owner === actor.name && p.budget > 1_000_000) return fail('You own this project — budgets over 1M need a different approver');
    patchExt(projectId, { budgetApprovedBy: actor.name }, 'Budget approved', `${p.budget.toLocaleString()} KES`);
    return done('Budget approved', p.name);
  };
  const setStatus = (projectId: string, status: Project['status']): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const p = project(projectId);
    const e = ext(projectId);
    if (p.status === status) return { ok: true };
    if (status === 'ACTIVE' && p.status === 'PLANNING') {
      if (e.kind === 'INVESTMENT' && e.appraisal?.decision !== 'APPROVED') return fail('An investment project needs an approved appraisal before it starts');
      if (!e.budgetApprovedBy) return fail('The budget must be approved before the project starts');
      if (!e.phases.length) return fail('Add the phases (work breakdown) first');
    }
    if (status === 'DONE') {
      if (p.milestones.some((m) => !m.done)) return fail('Close every milestone first');
      if (e.tasks.some((t) => t.progress < 100)) return fail('Every task must be 100% done');
    }
    if (p.status === 'DONE') return fail('The project is closed');
    patchProject(projectId, { status });
    patchExt(projectId, {}, `Status: ${status.toLowerCase().replace('_', ' ')}`);
    return done('Project updated', `${p.name} is ${status.toLowerCase().replace('_', ' ')}`);
  };
  /** Investment orders are capitalised into the Finance fixed asset register at their actual cost. */
  const capitalise = (projectId: string, lifeMonths: number): Result => {
    const g = guard('MANAGER');
    if (g) return g;
    const p = project(projectId);
    const e = ext(projectId);
    if (e.kind !== 'INVESTMENT') return fail('Only investment projects are capitalised');
    if (p.status !== 'DONE') return fail('Capitalise once the project is complete');
    if (e.capitalisedAs) return fail(`Already capitalised as ${e.capitalisedAs}`);
    if (!(lifeMonths > 0)) return fail('Enter the useful life');
    const before = ops.finance.snapshot().assets.length;
    const r = ops.finance.addAsset({ name: p.name, category: e.assetCategory ?? 'Plant & machinery', costAccount: e.assetCategory === 'Motor vehicles' ? '1500' : e.assetCategory === 'Computers & office equipment' ? '1520' : '1510', acquired: TODAY, cost: p.spent, residual: 0, lifeMonths, location: 'Factory', custodian: p.owner }, '1000');
    if (!r.ok) return r;
    const asset = ops.finance.snapshot().assets[before];
    patchExt(projectId, { capitalisedAs: asset?.number }, `Capitalised as ${asset?.number}`, `${p.spent.toLocaleString()} KES over ${lifeMonths} months`);
    return { ok: true };
  };
  const recordBenefit = (projectId: string, period: string, amount: number, note: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!/^\d{4}-\d{2}$/.test(period)) return fail('Choose the month');
    if (!(amount >= 0)) return fail('Enter the benefit');
    const e = ext(projectId);
    patchExt(projectId, { benefits: [...e.benefits.filter((b) => b.period !== period), { period, amount, note }].sort((a, b) => a.period.localeCompare(b.period)) }, `Benefit recorded for ${period}`);
    return done('Benefit recorded', `${amount.toLocaleString()} KES for ${period}`);
  };

  /* ---------------- Costs: materials, time, expenses, subcontract ---------------- */
  const saveMaterial = (projectId: string, m: { phaseId: string; sku: string; qty: number; neededBy: string }): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!m.phaseId || !m.sku || !(m.qty > 0)) return fail('Choose the phase, the item and the quantity');
    patchExt(projectId, { materials: [...ext(projectId).materials, { ...m, id: uid('mt'), issued: 0 }] }, 'Material planned', `${m.qty} × ${ops.pname(m.sku)}`);
    return { ok: true };
  };
  /** Stores issue planned material to the project phase: stock goes down and the cost lands on the project. */
  const issueMaterial = (projectId: string, materialId: string, qty: number): Result => {
    const g = guard('STOREKEEPER', 'MANAGER');
    if (g) return g;
    const e = ext(projectId);
    const m = e.materials.find((x) => x.id === materialId)!;
    if (project(projectId).status !== 'ACTIVE') return fail('Issue materials to an active project');
    if (!(qty > 0) || qty > m.qty - m.issued) return fail(`Issue between 1 and ${m.qty - m.issued}`);
    const have = stockAt(ops.snapshot(), products, m.sku, SPARES_STORE);
    if (have < qty) return fail(`Only ${have} of ${ops.pname(m.sku)} at ${SPARES_STORE}`);
    const res = ops.commercial.adjustStock([{ sku: m.sku, delta: -qty }]);
    if (!res.ok) return res;
    const unit = products.find((p) => p.sku === m.sku)?.cost ?? 0;
    ops.mutate((s) => ({ ...s, moves: [{ id: uid('mv'), date: TODAY, sku: m.sku, qty: -qty, from: SPARES_STORE, kind: 'ADJUSTMENT', ref: `${e.code} project issue`, by: actor.name }, ...s.moves] }));
    patchExt(projectId, { materials: e.materials.map((x) => (x.id === materialId ? { ...x, issued: x.issued + qty } : x)) }, 'Material issued', `${qty} × ${ops.pname(m.sku)}`);
    addCosts([{ projectId, phaseId: m.phaseId, type: 'MATERIAL', amount: qty * unit, source: `Stock issue ${SPARES_STORE}`, description: `${qty} × ${ops.pname(m.sku)}` }]);
    return done('Material issued', `${qty} × ${ops.pname(m.sku)} to ${e.code}`);
  };
  const requisitionShortages = (projectId: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const e = ext(projectId);
    const short = projectShortages(e, products, ops.commercial.state.purchaseOrders).filter((x) => x.short > 0 && !x.requisitionNumber);
    if (!short.length) return fail('Nothing is short — stock and open orders cover the plan');
    const r = ops.commercial.saveRequisition({ department: 'Projects', requestedBy: actor.name, neededBy: short.map((x) => x.neededBy).sort()[0], justification: `Materials for ${e.code} ${project(projectId).name}`, lines: short.map((x) => ({ id: uid('rl'), sku: x.sku, description: x.name, qty: x.short, estPrice: x.unitCost })) });
    if (!r.ok || !r.id) return r;
    const req = ops.commercial.snapshot().requisitions.find((x) => x.id === r.id);
    patchExt(projectId, { materials: e.materials.map((m) => (short.some((x) => x.id === m.id) ? { ...m, requisitionNumber: req?.number } : m)) }, `Requisition ${req?.number} raised for shortages`);
    return { ok: true, id: r.id };
  };
  const logTime = (t: { projectId: string; phaseId: string; employee: string; date: string; hours: number; rate: number; billRate: number }): Result => {
    const g = guard();
    if (g) return g;
    if (!t.phaseId || !t.employee.trim()) return fail('Choose the phase and the employee');
    if (!(t.hours > 0 && t.hours <= 16)) return fail('Hours per day are between 0 and 16');
    if (t.date > TODAY) return fail('Time cannot be booked in the future');
    if (!(t.rate > 0)) return fail('Enter the cost rate');
    const already = ref.current.timesheets.filter((x) => x.employee === t.employee && x.date === t.date && x.status !== 'REJECTED').reduce((a, x) => a + x.hours, 0);
    if (already + t.hours > 16) return fail(`${t.employee} already has ${already} h on ${t.date}`);
    commit({ ...ref.current, timesheets: [{ ...t, id: uid('ts'), status: 'SUBMITTED' }, ...ref.current.timesheets] });
    return done('Time submitted', `${t.hours} h for approval by the project owner`);
  };
  /** Project owner approves time: labour cost and the overhead (burden) on it go to the project. */
  const decideTime = (id: string, approve: boolean): Result => {
    const g = guard();
    if (g) return g;
    const t = ref.current.timesheets.find((x) => x.id === id)!;
    const p = project(t.projectId);
    if (t.status !== 'SUBMITTED') return fail('Already decided');
    if (!isOwner(p)) return fail(`Time is approved by the project owner (${p.owner}) or the Operations Manager`);
    if (t.employee === actor.name) return fail('You cannot approve your own time');
    commit({ ...ref.current, timesheets: ref.current.timesheets.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: actor.name } : x)) });
    if (approve) {
      const labour = t.hours * t.rate;
      const burden = (labour * ext(t.projectId).burdenRatePct) / 100;
      const customer = ext(t.projectId).kind === 'CUSTOMER';
      addCosts([
        { projectId: t.projectId, phaseId: t.phaseId, type: 'LABOUR', amount: labour, source: 'Timesheet', description: `${t.employee} ${t.hours} h on ${t.date}`, billable: customer },
        ...(burden ? [{ projectId: t.projectId, phaseId: t.phaseId, type: 'BURDEN' as const, amount: burden, source: `Overhead ${ext(t.projectId).burdenRatePct}%`, description: `Overhead on ${t.employee} ${t.date}` }] : [])
      ]);
    }
    return done(approve ? 'Time approved' : 'Time rejected', `${t.employee} · ${t.hours} h`);
  };
  const submitExpense = (x: Omit<ExpenseClaim, 'id' | 'number' | 'status'>): Result => {
    const g = guard();
    if (g) return g;
    if (!x.phaseId || !x.employee.trim() || !x.description.trim()) return fail('Choose the phase, the employee and describe the expense');
    if (!(x.amount > 0)) return fail('Enter the amount');
    if (x.category === 'PER_DIEM' && x.amount > 12_000) return fail('Per diem is capped at 12,000 KES a day');
    const n = (ref.current.sequence.EXP ?? 0) + 1;
    const number = `EXP-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`;
    commit({ ...ref.current, sequence: { ...ref.current.sequence, EXP: n }, expenses: [{ ...x, id: uid('ex'), number, status: 'SUBMITTED' }, ...ref.current.expenses] });
    return done('Expense claim submitted', `${number} for approval by the project owner`);
  };
  /** Approved claims are charged to the project and sent to Finance as an accrual journal for payment. */
  const decideExpense = (id: string, approve: boolean): Result => {
    const g = guard();
    if (g) return g;
    const x = ref.current.expenses.find((e) => e.id === id)!;
    const p = project(x.projectId);
    if (x.status !== 'SUBMITTED') return fail('Already decided');
    if (!isOwner(p)) return fail(`Expenses are approved by the project owner (${p.owner}) or the Operations Manager`);
    if (x.employee === actor.name) return fail('You cannot approve your own claim');
    let journalNumber: string | undefined;
    if (approve) {
      const j = ops.finance.saveJournal({
        date: TODAY,
        memo: `Expense claim ${x.number} — ${x.employee} (${ext(x.projectId).code})`,
        lines: [
          { id: uid('l'), account: EXPENSE_ACCOUNT[x.category], description: `${x.description} — ${ext(x.projectId).code}`, debit: x.amount, credit: 0, department: 'Projects' },
          { id: uid('l'), account: '2200', description: `Payable to ${x.employee}`, debit: 0, credit: x.amount, department: 'Projects' }
        ]
      });
      if (!j.ok || !j.id) return j;
      ops.finance.transition('journals', j.id, 'submit');
      journalNumber = ops.finance.snapshot().journals.find((y) => y.id === j.id)?.number;
      addCosts([{ projectId: x.projectId, phaseId: x.phaseId, type: 'EXPENSE', amount: x.amount, source: x.number, description: `${x.category.toLowerCase().replace('_', ' ')} — ${x.description}`, billable: x.billable }]);
    }
    commit({ ...ref.current, expenses: ref.current.expenses.map((e) => (e.id === id ? { ...e, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: actor.name, journalNumber } : e)) });
    notify({ module: 'Projects', to: x.employee, subject: `Expense claim ${x.number} ${approve ? 'approved' : 'rejected'}`, body: approve ? `Journal ${journalNumber} sent to Finance for payment` : undefined, ref: x.number });
    return done(approve ? 'Expense approved' : 'Expense rejected', approve ? `${x.number} · journal ${journalNumber} sent to Finance` : x.number);
  };
  const addCost = (projectId: string, c: { phaseId: string; type: CostType; amount: number; source: string; description: string; billable?: boolean }): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (!c.phaseId || !c.description.trim() || !c.source.trim()) return fail('Choose the phase, the source document and describe the cost');
    if (!(c.amount > 0)) return fail('Enter the amount');
    if (project(projectId).status === 'DONE') return fail('The project is closed');
    addCosts([{ projectId, ...c }]);
    return done('Cost recorded', `${c.amount.toLocaleString()} KES on ${ext(projectId).code}`);
  };

  /* ---------------- Customer projects: orders and billing ---------------- */
  const linkOrder = (projectId: string, orderNumber: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const e = ext(projectId);
    const o = ops.commercial.state.orders.find((x) => x.number === orderNumber);
    if (!o) return fail('Choose a sales order');
    if (e.customerId && o.customerId !== e.customerId) return fail('That order is for a different customer');
    if (Object.values(ref.current.ext).some((x) => x.orderNumbers.includes(orderNumber))) return fail('That order is already on a project');
    patchExt(projectId, { orderNumbers: [...e.orderNumbers, orderNumber], customerId: e.customerId ?? o.customerId }, `Sales order ${orderNumber} linked`);
    return { ok: true };
  };
  /** Time and expense billing: approved billable hours at the bill rate and billable expenses at cost go on one invoice. */
  const billProject = (projectId: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const e = ext(projectId);
    if (e.kind !== 'CUSTOMER' || !e.customerId) return fail('Only customer projects are billed');
    const ts = ref.current.timesheets.filter((t) => t.projectId === projectId && t.status === 'APPROVED' && !t.billed);
    const ex = ref.current.expenses.filter((x) => x.projectId === projectId && x.status === 'APPROVED' && x.billable && !x.billed);
    if (!ts.length && !ex.length) return fail('Nothing billable — approve time or billable expenses first');
    const cust = ops.finance.snapshot().parties.find((p) => p.id === e.customerId);
    const r = ops.finance.saveDocument(
      {
        kind: 'INVOICE',
        partyId: e.customerId,
        date: TODAY,
        dueDate: addDays(TODAY, cust?.terms ?? 30),
        reference: `${e.code} time & expenses`,
        department: 'Projects',
        notes: `Project ${e.code} ${project(projectId).name}`,
        lines: [
          ...ts.map((t) => ({ id: uid('l'), description: `${t.employee} — ${t.hours} h on ${t.date} (${e.code})`, account: '4000', qty: t.hours, price: t.billRate, vat: true })),
          ...ex.map((x) => ({ id: uid('l'), description: `${x.description} (${x.number})`, account: '4100', qty: 1, price: x.amount, vat: true }))
        ]
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const inv = ops.finance.snapshot().documents.find((d) => d.id === r.id)!;
    const amount = round2(ts.reduce((a, t) => a + t.hours * t.billRate, 0) + ex.reduce((a, x) => a + x.amount, 0));
    commit({
      ...ref.current,
      timesheets: ref.current.timesheets.map((t) => (ts.some((y) => y.id === t.id) ? { ...t, billed: inv.number } : t)),
      expenses: ref.current.expenses.map((x) => (ex.some((y) => y.id === x.id) ? { ...x, billed: inv.number } : x)),
      costs: ref.current.costs.map((c) => (c.projectId === projectId && c.billable && !c.billed ? { ...c, billed: inv.number } : c))
    });
    patchExt(projectId, { invoices: [...e.invoices, { number: inv.number, amount, date: TODAY }] }, `Invoice ${inv.number} raised in Finance`, `${amount.toLocaleString()} KES before VAT`);
    return done('Invoice raised in Finance', `${inv.number} · ${amount.toLocaleString()} KES (draft for approval)`);
  };

  /* ---------------- Certificates ---------------- */
  const issueCertificate = (projectId: string, kind: 'STATUS' | 'COMPLETION', summary: string, signature: ESignature): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const p = project(projectId);
    const e = ext(projectId);
    if (!summary.trim()) return fail('Write the certificate summary');
    if (kind === 'COMPLETION' && (p.milestones.some((m) => !m.done) || e.tasks.some((t) => t.progress < 100))) return fail('A completion certificate needs every milestone and task complete');
    const n = (ref.current.sequence.CERT ?? 0) + 1;
    const number = `CERT-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`;
    commit({ ...ref.current, sequence: { ...ref.current.sequence, CERT: n } });
    patchExt(projectId, { certificates: [...e.certificates, { id: uid('ce'), number, kind, date: TODAY, summary, issuedBy: actor.name, signature }] }, `${kind === 'COMPLETION' ? 'Completion' : 'Status'} certificate ${number} signed`);
    audit({ module: 'Projects', by: actor.name, action: 'Certificate signed', ref: number, note: `${e.code} ${kind.toLowerCase()}` });
    return done('Certificate issued', number);
  };

  const reset = () => commit(buildProjectsSeed());

  return {
    state,
    actor,
    canWrite: access.canWrite,
    saveProject,
    copyPlan,
    savePhase,
    saveTask,
    submitAppraisal,
    decideAppraisal,
    approveBudget,
    setStatus,
    capitalise,
    recordBenefit,
    saveMaterial,
    issueMaterial,
    requisitionShortages,
    logTime,
    decideTime,
    submitExpense,
    decideExpense,
    addCost,
    linkOrder,
    billProject,
    issueCertificate,
    reset
  };
};

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useProjectsStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useProjects = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProjects must be used inside ProjectsProvider');
  return ctx;
};
