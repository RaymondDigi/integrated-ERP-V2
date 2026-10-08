import { TODAY } from '../../finance/engine';
import { notify } from '../../../platform/outbox';
import { CTL_ACTORS } from '../data';
import type { Change, ConfigItem, Connector, ItAsset, KbArticle, MonitorRule, Problem, TestCase, Ticket } from '../types';
import { isIctRole, type ActionKit, type Result } from './kit';

/** Service desk, problem and change management, CMDB, knowledge base, monitoring, integrations and test cases. */
export const ictActions = (k: ActionKit) => {
  const { get, commit, fail, done, log, next, uid, actor, trail } = k;
  const isIct = isIctRole(actor);
  const ictNames = [CTL_ACTORS.ICT_OFFICER.name, CTL_ACTORS.ICT_MANAGER.name];

  /* ---------------- Tickets ---------------- */
  const touch = (id: string, patch: Partial<Ticket>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, tickets: s.tickets.map((x) => (x.id === id ? { ...x, ...patch, notes: [...x.notes, log(action, note)] } : x)) });
  };
  const assignTicket = (id: string, agent: string): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager assigns tickets to the team');
    if (!ictNames.includes(agent)) return fail('Assign to a member of the ICT team');
    const t = get().tickets.find((x) => x.id === id)!;
    if (t.status === 'RESOLVED') return fail('The ticket is resolved');
    touch(id, { assignee: agent, status: t.status === 'NEW' ? 'IN_PROGRESS' : t.status, firstResponse: t.firstResponse ?? k.now() }, `Assigned to ${agent}`);
    notify({ module: 'ICT', to: agent, subject: `${t.number} assigned to you (${t.priority})`, body: t.title, ref: t.number });
    return done('Assigned', `${t.number} → ${agent}`);
  };
  /** Requester confirms the fix — the ticket closes for good. */
  const confirmTicket = (id: string): Result => {
    const t = get().tickets.find((x) => x.id === id)!;
    if (t.status !== 'RESOLVED') return fail('Only a resolved ticket can be confirmed');
    if (t.closedAt) return fail('Already closed');
    touch(id, { closedAt: k.now() }, 'Requester confirmed the fix — closed');
    return done('Closed', `${t.number} confirmed by the requester`);
  };
  const reopenTicket = (id: string, reason: string): Result => {
    const t = get().tickets.find((x) => x.id === id)!;
    if (t.status !== 'RESOLVED') return fail('Only resolved tickets can be reopened');
    if (t.closedAt) return fail('The requester already confirmed this fix — log a new ticket');
    if (!reason.trim()) return fail('Say why the problem is back');
    touch(id, { status: 'IN_PROGRESS', resolvedAt: undefined, reopened: (t.reopened ?? 0) + 1 }, 'Reopened', reason);
    if (t.assignee) notify({ module: 'ICT', to: t.assignee, level: 'warning', subject: `${t.number} reopened`, body: reason, ref: t.number });
    return done('Reopened', t.number);
  };
  const linkKb = (ticketId: string, kbId: string): Result => {
    const t = get().tickets.find((x) => x.id === ticketId)!;
    if ((t.kbIds ?? []).includes(kbId)) return fail('Already linked');
    touch(ticketId, { kbIds: [...(t.kbIds ?? []), kbId] }, 'Knowledge article linked', get().kb.find((a) => a.id === kbId)?.number);
    return { ok: true };
  };
  /** Simulated email intake: an email to helpdesk@ becomes a ticket. */
  const intakeEmail = (from: string, subject: string): Result => {
    if (!subject.trim() || !from.trim()) return fail('Enter the sender and subject');
    const s = get();
    const { number, sequence } = next(s, 'INC');
    const id = uid('tk');
    commit({ ...s, sequence, tickets: [{ id, number, title: subject, requester: from, department: 'Unknown', category: 'Software', priority: 'P3', created: k.now(), status: 'NEW', channel: 'Email', notes: [{ at: k.now(), by: 'helpdesk@intergrated-erp.ke', action: 'Created from email' }] }, ...s.tickets] });
    notify({ module: 'ICT', to: from, channels: ['EMAIL'], subject: `[${number}] We have logged your request`, body: subject, ref: number });
    return done('Email converted to a ticket', number, id);
  };

  /* ---------------- Problems ---------------- */
  const raiseProblem = (p: Pick<Problem, 'title' | 'description' | 'ticketIds' | 'ciIds'>): Result => {
    if (!isIct) return fail('Problems are managed by ICT');
    if (!p.title.trim()) return fail('Name the problem');
    if (!p.ticketIds.length) return fail('Link at least one incident');
    const s = get();
    const { number, sequence } = next(s, 'PRB');
    const id = uid('pb');
    commit({ ...s, sequence, problems: [{ ...p, id, number, owner: actor.name, rootCause: '', workaround: '', status: 'OPEN', history: [log('Raised')] }, ...s.problems], tickets: s.tickets.map((t) => (p.ticketIds.includes(t.id) ? { ...t, problemId: id, notes: [...t.notes, log(`Linked to problem ${number}`)] } : t)) });
    return done('Problem raised', number, id);
  };
  const updateProblem = (id: string, patch: Pick<Problem, 'rootCause' | 'workaround'>): Result => {
    if (!isIct) return fail('Problems are managed by ICT');
    const s = get();
    const p = s.problems.find((x) => x.id === id)!;
    if (p.status === 'RESOLVED') return fail('The problem is resolved');
    if (!patch.workaround.trim() && !patch.rootCause.trim()) return fail('Record a workaround or the root cause');
    const status: Problem['status'] = patch.workaround.trim() ? 'KNOWN_ERROR' : p.status;
    commit({ ...s, problems: s.problems.map((x) => (x.id === id ? { ...x, ...patch, status, history: [...x.history, log(status === 'KNOWN_ERROR' && p.status !== 'KNOWN_ERROR' ? 'Workaround published — known error' : 'Updated')] } : x)) });
    return done('Problem updated', status === 'KNOWN_ERROR' ? 'Recorded as a known error' : p.number);
  };
  const linkProblemTicket = (id: string, ticketId: string): Result => {
    const s = get();
    const p = s.problems.find((x) => x.id === id)!;
    if (p.ticketIds.includes(ticketId)) return fail('Already linked');
    commit({ ...s, problems: s.problems.map((x) => (x.id === id ? { ...x, ticketIds: [...x.ticketIds, ticketId], history: [...x.history, log('Incident linked', s.tickets.find((t) => t.id === ticketId)?.number)] } : x)), tickets: s.tickets.map((t) => (t.id === ticketId ? { ...t, problemId: id } : t)) });
    return { ok: true };
  };
  const resolveProblem = (id: string): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager signs off a problem as resolved');
    const s = get();
    const p = s.problems.find((x) => x.id === id)!;
    if (!p.rootCause.trim()) return fail('Record the root cause before resolving');
    const open = s.tickets.filter((t) => p.ticketIds.includes(t.id) && t.status !== 'RESOLVED');
    if (open.length) return fail(`${open.length} linked incident${open.length === 1 ? ' is' : 's are'} still open`);
    commit({ ...s, problems: s.problems.map((x) => (x.id === id ? { ...x, status: 'RESOLVED', history: [...x.history, log('Resolved')] } : x)) });
    trail('ICT', 'Problem resolved', p.number);
    return done('Problem resolved', p.number);
  };

  /* ---------------- Changes ---------------- */
  const createChange = (c: Pick<Change, 'title' | 'system' | 'risk' | 'window' | 'backout'> & { type: NonNullable<Change['type']>; description: string; ciIds: string[] }): Result => {
    if (!isIct) return fail('Changes are raised by ICT');
    if (!c.title.trim() || !c.system.trim() || !c.window.trim()) return fail('Title, system and change window are required');
    if (c.backout.trim().length < 10) return fail('Every change needs a back-out plan');
    const s = get();
    const { number, sequence } = next(s, 'CHG');
    const id = uid('ch');
    const standard = c.type === 'STANDARD';
    commit({ ...s, sequence, changes: [{ ...c, id, number, requestedBy: actor.name, status: standard ? 'APPROVED' : 'SUBMITTED', approvals: [], history: [log('Submitted'), ...(standard ? [log('Pre-approved standard change')] : [])] }, ...s.changes] });
    if (!standard) notify({ module: 'ICT', to: 'ICT Manager (change board)', level: c.type === 'EMERGENCY' ? 'critical' : 'info', subject: `${c.type === 'EMERGENCY' ? 'EMERGENCY ' : ''}change for the board: ${c.title}`, ref: number });
    trail('ICT', 'Change raised', number);
    return done(standard ? 'Standard change — pre-approved' : 'Change submitted', number, id);
  };
  const recordOutcome = (id: string, outcome: NonNullable<Change['outcome']>, note: string): Result => {
    if (!isIct) return fail('ICT records the outcome');
    const s = get();
    const c = s.changes.find((x) => x.id === id)!;
    if (c.status !== 'APPROVED') return fail('Only approved changes can be implemented');
    if (outcome !== 'SUCCESS' && !note.trim()) return fail('Describe what went wrong');
    commit({ ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, status: 'IMPLEMENTED', outcome, history: [...x.history, log(outcome === 'SUCCESS' ? 'Implemented successfully' : outcome === 'FAILED' ? 'Implementation failed' : 'Rolled back using the back-out plan', note || undefined)] } : x)) });
    trail('ICT', `Change ${outcome.toLowerCase().replace('_', ' ')}`, c.number, { note: note || undefined });
    if (outcome !== 'SUCCESS') notify({ module: 'ICT', to: 'ICT Manager', level: 'warning', subject: `${c.number} ${outcome === 'FAILED' ? 'failed' : 'was rolled back'}`, body: note, ref: c.number });
    return done(outcome === 'SUCCESS' ? 'Implemented' : outcome === 'FAILED' ? 'Recorded as failed' : 'Recorded as rolled back', c.number);
  };
  const reviewChange = (id: string, pir: string): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager runs the post-implementation review');
    const s = get();
    const c = s.changes.find((x) => x.id === id)!;
    if (c.status !== 'IMPLEMENTED') return fail('Review after implementation');
    if (c.pir) return fail('Already reviewed');
    if (pir.trim().length < 10) return fail('Write the review findings');
    commit({ ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, pir, history: [...x.history, log('Post-implementation review', pir)] } : x)) });
    return done('Review recorded', c.number);
  };

  /* ---------------- Assets and licences ---------------- */
  const saveAsset = (a: Omit<ItAsset, 'id' | 'history'> & { id?: string }): Result => {
    if (!isIct) return fail('IT assets are maintained by ICT');
    if (!a.tag.trim() || !a.model.trim()) return fail('Asset tag and model are required');
    if (a.warrantyEnd && a.purchased && a.warrantyEnd < a.purchased) return fail('Warranty cannot end before the purchase date');
    const s = get();
    if (s.assets.some((x) => x.tag.trim().toUpperCase() === a.tag.trim().toUpperCase() && x.id !== a.id)) return fail(`Tag ${a.tag} is already used`);
    if (a.serial && s.assets.some((x) => x.serial && x.serial === a.serial && x.id !== a.id)) return fail('That serial number is already registered');
    if (a.id) {
      const cur = s.assets.find((x) => x.id === a.id)!;
      const changed = (['model', 'serial', 'cpu', 'ram', 'os', 'location', 'warrantyEnd', 'status', 'assignedTo', 'department'] as const).filter((f) => String(cur[f] ?? '') !== String(a[f] ?? ''));
      commit({ ...s, assets: s.assets.map((x) => (x.id === a.id ? { ...x, ...a, history: [...(x.history ?? []), log(`Updated: ${changed.join(', ') || 'no changes'}`)] } : x)) });
      changed.forEach((f) => trail('ICT', 'Asset changed', cur.tag, { field: f, before: String(cur[f] ?? ''), after: String(a[f] ?? '') }));
      return done('Asset saved', a.tag, a.id);
    }
    const id = uid('it');
    commit({ ...s, assets: [...s.assets, { ...a, id, history: [log('Registered')] }] });
    trail('ICT', 'Asset registered', a.tag);
    return done('Asset registered', a.tag, id);
  };
  const assignAsset = (id: string, to: string, department: string): Result => {
    if (!isIct) return fail('IT assets are issued by ICT');
    if (!to.trim()) return fail('Who is it issued to?');
    const s = get();
    const a = s.assets.find((x) => x.id === id)!;
    if (a.status === 'RETIRED') return fail('A retired asset cannot be issued');
    if (a.status === 'REPAIR') return fail('The asset is in repair');
    commit({ ...s, assets: s.assets.map((x) => (x.id === id ? { ...x, assignedTo: to, department, status: 'IN_USE', history: [...(x.history ?? []), log(`Issued to ${to} (${department})`, `was ${a.assignedTo}`)] } : x)) });
    trail('ICT', 'Asset issued', a.tag, { field: 'assignedTo', before: a.assignedTo, after: to });
    return done('Asset issued', `${a.tag} → ${to}`);
  };
  const retireAsset = (id: string, reason: string): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager approves disposal of assets');
    if (!reason.trim()) return fail('Give the reason and disposal method');
    const s = get();
    const a = s.assets.find((x) => x.id === id)!;
    if (a.status === 'RETIRED') return fail('Already retired');
    commit({ ...s, assets: s.assets.map((x) => (x.id === id ? { ...x, status: 'RETIRED', assignedTo: 'Disposed', history: [...(x.history ?? []), log('Retired', reason)] } : x)), cis: s.cis.map((c) => (c.assetId === id ? { ...c, status: 'RETIRED' } : c)) });
    trail('ICT', 'Asset retired', a.tag, { note: reason });
    return done('Asset retired', a.tag);
  };
  const assignSeat = (licenceId: string, person: string, add: boolean): Result => {
    if (!isIct) return fail('Licences are managed by ICT');
    const s = get();
    const l = s.licences.find((x) => x.id === licenceId)!;
    const list = l.assignees ?? [];
    if (add) {
      if (!person.trim()) return fail('Name the person');
      if (list.includes(person)) return fail(`${person} already has a seat`);
      if (l.used >= l.seats) return fail(`All ${l.seats} seats are in use — buy more or free one`);
    } else if (!list.includes(person)) return fail('Not assigned');
    commit({ ...s, licences: s.licences.map((x) => (x.id === licenceId ? { ...x, used: x.used + (add ? 1 : -1), assignees: add ? [...list, person] : list.filter((p) => p !== person) } : x)) });
    trail('ICT', add ? 'Licence seat assigned' : 'Licence seat freed', l.name, { note: person });
    return done(add ? 'Seat assigned' : 'Seat freed', `${l.name} · ${person}`);
  };

  /* ---------------- CMDB ---------------- */
  const saveCi = (c: Omit<ConfigItem, 'id' | 'source'> & { id?: string }): Result => {
    if (!isIct) return fail('The CMDB is maintained by ICT');
    if (!c.name.trim() || !c.businessSystem.trim() || !c.owner.trim()) return fail('Name, business system and owner are required');
    if (c.id && c.dependsOn.includes(c.id)) return fail('An item cannot depend on itself');
    const s = get();
    if (s.cis.some((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase() && x.id !== c.id)) return fail('A configuration item with that name exists');
    if (c.id) {
      commit({ ...s, cis: s.cis.map((x) => (x.id === c.id ? { ...x, ...c } : x)) });
      trail('ICT', 'Configuration item changed', c.name);
      return done('Saved', c.name, c.id);
    }
    const id = uid('ci');
    commit({ ...s, cis: [...s.cis, { ...c, id, source: 'MANUAL' }] });
    trail('ICT', 'Configuration item added', c.name);
    return done('Added to the CMDB', c.name, id);
  };
  /** Imports a discovery scan export (CSV) into the CMDB: new names are added, known names updated. */
  const importDiscovery = (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    if (!isIct) return { imported: 0, errors: ['The CMDB is maintained by ICT — switch to an ICT persona'] };
    let s = get();
    let imported = 0;
    const kinds: ConfigItem['kind'][] = ['Server', 'Network', 'Application', 'Database', 'Service', 'Endpoint'];
    rows.forEach((r, i) => {
      const kind = kinds.find((x) => x.toLowerCase() === (r.kind ?? '').toLowerCase());
      if (!r.name) return errors.push(`Row ${i + 2}: name is empty`);
      if (!kind) return errors.push(`Row ${i + 2}: kind must be one of ${kinds.join(', ')}`);
      if (r.ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(r.ip)) return errors.push(`Row ${i + 2}: ${r.ip} is not an IPv4 address`);
      const existing = s.cis.find((c) => c.name.toLowerCase() === r.name.toLowerCase());
      const item: ConfigItem = { id: existing?.id ?? uid('ci'), name: r.name, kind, location: r.location || existing?.location || 'Unknown', owner: r.owner || existing?.owner || 'ICT', businessSystem: r.businessSystem || existing?.businessSystem || 'Unassigned', dependsOn: existing?.dependsOn ?? [], ip: r.ip || existing?.ip, status: 'LIVE', source: 'DISCOVERY' };
      s = { ...s, cis: existing ? s.cis.map((c) => (c.id === existing.id ? item : c)) : [...s.cis, item] };
      imported++;
    });
    if (imported) {
      commit(s);
      trail('ICT', 'Discovery scan imported', `${imported} items`);
    }
    return { imported, errors };
  };

  /* ---------------- Knowledge base ---------------- */
  const saveArticle = (a: Pick<KbArticle, 'title' | 'category' | 'body' | 'tags'> & { id?: string; note?: string; fromTicket?: string }): Result => {
    if (!a.title.trim() || a.body.trim().length < 20) return fail('Give the article a title and at least a couple of sentences');
    const s = get();
    if (a.id) {
      const cur = s.kb.find((x) => x.id === a.id)!;
      if (cur.body === a.body && cur.title === a.title && cur.tags.join() === a.tags.join() && cur.category === a.category) return fail('Nothing changed');
      commit({ ...s, kb: s.kb.map((x) => (x.id === a.id ? { ...x, title: a.title, category: a.category, body: a.body, tags: a.tags, updated: TODAY, revisions: [...x.revisions, { at: k.now(), by: actor.name, note: a.note || 'Edited', body: cur.body }] } : x)) });
      return done('Article updated', cur.number, a.id);
    }
    const { number, sequence } = next(s, 'KB');
    const id = uid('kb');
    const kbNo = number.replace(/-\d{4}-/, '-');
    commit({ ...s, sequence, kb: [{ id, number: kbNo, title: a.title, category: a.category, body: a.body, tags: a.tags, author: actor.name, updated: TODAY, views: 0, helpful: 0, revisions: [], fromTicket: a.fromTicket }, ...s.kb], tickets: a.fromTicket ? s.tickets.map((t) => (t.id === a.fromTicket ? { ...t, kbIds: [...(t.kbIds ?? []), id] } : t)) : s.tickets });
    return done('Article published', kbNo, id);
  };
  const rateArticle = (id: string): Result => {
    const s = get();
    commit({ ...s, kb: s.kb.map((x) => (x.id === id ? { ...x, helpful: x.helpful + 1 } : x)) });
    return done('Thanks', 'Marked as helpful');
  };
  const viewArticle = (id: string) => {
    const s = get();
    commit({ ...s, kb: s.kb.map((x) => (x.id === id ? { ...x, views: x.views + 1 } : x)) });
  };

  /* ---------------- Monitoring ---------------- */
  const saveMonitorRule = (r: Omit<MonitorRule, 'id'> & { id?: string }): Result => {
    if (!isIct) return fail('Monitoring thresholds are set by ICT');
    if (!r.target.trim()) return fail('Choose what to monitor');
    if (!(r.warn > 0) || !(r.critical > r.warn)) return fail('Critical must be above the warning level');
    const s = get();
    const full = { ...r, id: r.id ?? uid('mr') };
    commit({ ...s, monitorRules: r.id ? s.monitorRules.map((x) => (x.id === r.id ? full : x)) : [...s.monitorRules, full] });
    trail('ICT', r.id ? 'Monitoring threshold changed' : 'Monitoring threshold added', `${r.metric} · ${r.target}`, { after: `${r.warn}/${r.critical}` });
    return done('Threshold saved', `${r.metric} on ${r.target}`);
  };

  /* ---------------- Integrations ---------------- */
  const addConnector = (c: Pick<Connector, 'name' | 'provider' | 'purpose' | 'module' | 'schedule' | 'kind' | 'endpoint'>): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager adds new connections');
    if (!c.name.trim() || !c.provider.trim()) return fail('Name the connection and the provider');
    if (!c.endpoint?.trim()) return fail('Enter the endpoint (URL, server or DSN)');
    const s = get();
    const id = uid('cn');
    commit({ ...s, connectors: [...s.connectors, { ...c, id, status: 'PAUSED', lastSync: k.now() }], syncLog: [{ id: uid('sy'), connectorId: id, at: k.now(), direction: 'OUT', records: 0, status: 'OK', message: `Configured (${c.kind}) — simulated connection, test before resuming` }, ...s.syncLog] });
    trail('Integrations', 'Connector added', c.name, { note: `${c.kind} ${c.endpoint}` });
    return done('Connection added', `${c.name} — paused until you test it`, id);
  };

  /* ---------------- Test cases ---------------- */
  const saveTestCase = (t: Pick<TestCase, 'module' | 'title' | 'steps' | 'expected'>): Result => {
    if (!t.title.trim() || !t.expected.trim() || !t.steps.filter((x) => x.trim()).length) return fail('Title, at least one step and the expected result are needed');
    const s = get();
    const n = (s.sequence.TC ?? 0) + 1;
    const id = uid('tc');
    commit({ ...s, sequence: { ...s.sequence, TC: n }, testCases: [...s.testCases, { ...t, steps: t.steps.filter((x) => x.trim()), id, number: `TC-${String(n).padStart(3, '0')}`, runs: [] }] });
    return done('Test case added', `TC-${String(n).padStart(3, '0')}`, id);
  };
  /** Records a run; a failure raises an ICT ticket for the defect. */
  const runTestCase = (id: string, result: 'PASS' | 'FAIL', actual: string): Result => {
    if (!actual.trim()) return fail('Record what actually happened');
    let s = get();
    const t = s.testCases.find((x) => x.id === id)!;
    let ticketId: string | undefined;
    let ticketNo = '';
    if (result === 'FAIL') {
      const { number, sequence } = next(s, 'INC');
      ticketId = uid('tk');
      ticketNo = number;
      s = { ...s, sequence, tickets: [{ id: ticketId, number, title: `Test failed: ${t.number} ${t.title}`, requester: actor.name, department: 'ICT', category: 'ERP', priority: 'P3', created: k.now(), status: 'NEW', channel: 'Self-service', notes: [log('Raised from a failed test run', actual)] }, ...s.tickets] };
    }
    commit({ ...s, testCases: s.testCases.map((x) => (x.id === id ? { ...x, runs: [...x.runs, { id: uid('r'), at: TODAY, by: actor.name, result, actual, ticketId }] } : x)) });
    return done(result === 'PASS' ? 'Passed' : 'Failed — defect logged', result === 'PASS' ? t.number : `${ticketNo} raised for ${t.number}`);
  };

  return {
    assignTicket,
    confirmTicket,
    reopenTicket,
    linkKb,
    intakeEmail,
    raiseProblem,
    updateProblem,
    linkProblemTicket,
    resolveProblem,
    createChange,
    recordOutcome,
    reviewChange,
    saveAsset,
    assignAsset,
    retireAsset,
    assignSeat,
    saveCi,
    importDiscovery,
    saveArticle,
    rateArticle,
    viewArticle,
    saveMonitorRule,
    addConnector,
    saveTestCase,
    runTestCase
  };
};
