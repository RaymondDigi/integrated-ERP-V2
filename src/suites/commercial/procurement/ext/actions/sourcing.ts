import { addDays, round2, TODAY } from '../../../../finance/engine';
import type { Ctx, Result } from '../ctx';
import { bidProblem, eventLines, EVENT_KIND_LABEL, extendedEnd, latestResponses, linePrice, responseTotal } from '../engine';
import type { AuctionSettings, Contract, EventKind, EventLot, EventResponse, QSection, SourcingEvent } from '../types';

export interface EventDraft {
  title: string;
  kind: EventKind;
  category: string;
  businessUnit: string;
  opens: string;
  closes: string;
  qaDeadline?: string;
  lots: EventLot[];
  questionnaire: QSection[];
  priceWeight: number;
  terms: string;
  templateId?: string;
  auction?: Omit<AuctionSettings, 'extensions'>;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const sourcingActions = (c: Ctx) => {
  const { get, commit, fail, done, log, uid, next, now, party } = c;
  const buyer = () => c.actor.role === 'OFFICER' || c.actor.role === 'MANAGER' || c.actor.role === 'DIRECTOR';
  const ev = (id: string) => get().events.find((e) => e.id === id);
  const setEvent = (id: string, patch: (e: SourcingEvent) => Partial<SourcingEvent>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, ...patch(e), history: [...e.history, log(action, note)] } : e)) });
  };
  const supplierOk = (supplierId: string) => {
    const p = get().suppliers.find((x) => x.partyId === supplierId);
    return !p || p.status === 'APPROVED';
  };

  const validate = (d: EventDraft) => {
    if (!d.title.trim()) return 'Give the event a title';
    if (!d.lots.length || !d.lots.some((l) => l.lines.some((x) => x.description.trim() && x.qty > 0))) return 'Add at least one lot with a line to source';
    if (d.lots.some((l) => !l.name.trim())) return 'Name every lot';
    if (d.closes < d.opens) return 'The closing date cannot be before the opening date';
    if (d.qaDeadline && (d.qaDeadline < d.opens || d.qaDeadline > d.closes)) return 'The questions deadline must fall while the event is open';
    if (d.priceWeight < 0 || d.priceWeight > 100) return 'Price weight is a percentage between 0 and 100';
    const qw = d.questionnaire.reduce((s, x) => s + x.weight, 0);
    if (d.questionnaire.length && Math.abs(qw - 100) > 0.01) return `Section weights must add up to 100 (now ${qw})`;
    if (d.kind === 'REVERSE_AUCTION' || d.kind === 'AUCTION') {
      if (!d.auction) return 'Set the auction start and end';
      if (d.auction.end <= d.auction.start) return 'The auction must end after it starts';
      if (d.auction.minDecrementPct < 0 || d.auction.minDecrementPct > 50) return 'Minimum improvement must be between 0 and 50%';
    }
    return null;
  };

  const createEvent = (d: EventDraft, extra: Partial<SourcingEvent> = {}): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Sourcing events are run by Purchasing — switch to Peter Mwangi or Lucy Njeri');
    const problem = validate(d);
    if (problem) return fail(problem);
    const s = get();
    const { number, sequence } = next(s, 'RFX');
    const e: SourcingEvent = {
      id: uid('ev'),
      number,
      title: d.title.trim(),
      kind: d.kind,
      category: d.category,
      businessUnit: d.businessUnit,
      status: 'DRAFT',
      opens: d.opens,
      closes: d.closes,
      qaDeadline: d.qaDeadline,
      owner: c.actor.name,
      lots: d.lots.map((l) => ({ ...l, lines: l.lines.filter((x) => x.description.trim() && x.qty > 0) })),
      invited: [],
      responses: [],
      questionnaire: d.questionnaire,
      priceWeight: d.priceWeight,
      panel: [c.actor.name],
      evaluations: [],
      messages: [],
      auction: d.auction ? { ...d.auction, extensions: 0 } : undefined,
      bids: [],
      awards: [],
      terms: d.terms,
      templateId: d.templateId,
      history: [log(extra.convertedFrom ? 'Created by conversion' : d.templateId ? 'Created from template' : 'Created')],
      ...extra
    };
    commit({ ...s, sequence, events: [e, ...s.events] });
    return done('Sourcing event created', `${number} — ${EVENT_KIND_LABEL[d.kind]}`, e.id);
  };

  const updateEvent = (id: string, d: Partial<EventDraft>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'DRAFT') return fail('Only draft events can be edited — post a clarification on the message board instead');
    const merged = { ...e, ...d } as EventDraft;
    const problem = validate(merged);
    if (problem) return fail(problem);
    setEvent(id, () => ({ ...d, auction: d.auction ? { ...d.auction, extensions: 0 } : e.auction }), 'Edited');
    return done('Event saved', e.number, id);
  };

  /** Turns approved requisition lines into a sourcing event (off-contract requests go to RFQ). */
  const eventFromRequisitions = (reqIds: string[], kind: EventKind = 'RFQ'): Result => {
    const reqs = c.com.state.requisitions.filter((r) => reqIds.includes(r.id));
    if (!reqs.length) return fail('Choose at least one requisition');
    if (reqs.some((r) => r.status !== 'APPROVED')) return fail('Only approved requisitions can be sourced');
    const lots: EventLot[] = reqs
      .map((r) => {
        const done_ = r.awards?.flatMap((a) => a.lineIds) ?? (r.poId ? r.lines.map((l) => l.id) : []);
        return {
          id: uid('lot'),
          name: `${r.number} — ${r.department}`,
          lines: r.lines
            .filter((l) => !done_.includes(l.id))
            .map((l) => {
              const p = c.com.state.products.find((x) => x.sku === l.sku);
              return { id: uid('el'), sku: l.sku || undefined, description: l.description, qty: l.qty, uom: l.uom ?? p?.unit ?? 'each', spec: l.spec, serviceType: l.serviceType, reqId: r.id, reqLineId: l.id };
            })
        };
      })
      .filter((l) => l.lines.length);
    if (!lots.length) return fail('Every line on these requisitions is already ordered');
    const cat = c.com.state.products.find((p) => p.sku === lots[0].lines[0].sku)?.category ?? 'General';
    const r = createEvent({
      title: `${EVENT_KIND_LABEL[kind]} — ${reqs.map((x) => x.number).join(', ')}`,
      kind,
      category: cat,
      businessUnit: 'Blending & packing',
      opens: TODAY,
      closes: addDays(TODAY, 7),
      lots,
      questionnaire: [],
      priceWeight: 100,
      terms: 'Prices in KES exclusive of VAT, delivered to the factory store at Athi River.'
    });
    if (r.ok && r.id) {
      const s = get();
      const reqExt = { ...s.reqExt };
      for (const x of reqs) reqExt[x.id] = { ...(reqExt[x.id] ?? { customFields: {} }), eventId: r.id };
      commit({ ...s, reqExt });
    }
    return r;
  };

  const copyEvent = (id: string): Result => {
    const e = ev(id);
    if (!e) return fail('Event not found');
    const r = createEvent({ ...clone(e), title: `${e.title} (copy)`, opens: TODAY, closes: addDays(TODAY, 7), auction: e.auction ? { ...e.auction, start: new Date().toISOString(), end: new Date(Date.now() + 3_600_000).toISOString() } : undefined }, {});
    if (r.ok && r.id) {
      const s = get();
      commit({ ...s, events: s.events.map((x) => (x.id === r.id ? { ...x, invited: e.invited.map((i) => ({ supplierId: i.supplierId, at: now(), by: c.actor.name })), history: [...x.history, log(`Copied from ${e.number}`, `${e.invited.length} suppliers carried over`)] } : x)) });
    }
    return r;
  };

  const invite = (id: string, supplierIds: string[]): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Purchasing invites suppliers');
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'DRAFT' && e.status !== 'OPEN') return fail('Suppliers can be added while the event is in draft or open');
    const fresh = supplierIds.filter((x) => x && !e.invited.some((i) => i.supplierId === x));
    if (!fresh.length) return fail('Choose suppliers who are not already invited');
    const blocked = fresh.filter((x) => !supplierOk(x));
    if (blocked.length) return fail(`${blocked.map((x) => party(x)?.name).join(', ')} is not an approved supplier`);
    setEvent(id, (x) => ({ invited: [...x.invited, ...fresh.map((supplierId) => ({ supplierId, at: now(), by: c.actor.name }))] }), `Invited ${fresh.length} supplier${fresh.length > 1 ? 's' : ''}`, fresh.map((x) => party(x)?.name).join(', '));
    if (e.status === 'OPEN') for (const x of fresh) c.notifySupplier(x, `Invitation: ${e.number} ${e.title}`, `You are invited to respond by ${e.closes}. Open the supplier portal to view the documents and submit.`, e.number);
    return done('Suppliers invited', `${fresh.length} added to ${e.number}`);
  };

  const uninvite = (id: string, supplierId: string): Result => {
    const e = ev(id);
    if (!e || e.status !== 'DRAFT') return fail('Suppliers can only be removed before the event is published');
    setEvent(id, (x) => ({ invited: x.invited.filter((i) => i.supplierId !== supplierId) }), `Removed ${party(supplierId)?.name}`);
    return { ok: true };
  };

  const publish = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Purchasing publishes events');
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'DRAFT') return fail('Only draft events can be published');
    if (!e.invited.length) return fail('Invite at least one supplier first');
    if (e.closes < TODAY) return fail('The closing date has passed — move it before publishing');
    if (!eventLines(e).length) return fail('Add the lines to be quoted');
    setEvent(id, () => ({ status: 'OPEN', opens: e.opens < TODAY ? TODAY : e.opens }), `Published to ${e.invited.length} suppliers`);
    for (const i of e.invited) c.notifySupplier(i.supplierId, `New ${e.kind.replace('_', ' ')}: ${e.number} ${e.title}`, e.auction ? `Bidding opens ${new Date(e.auction.start).toLocaleString('en-GB')} and closes ${new Date(e.auction.end).toLocaleString('en-GB')}.` : `Responses close on ${e.closes}.`, e.number, true);
    return done('Event published', `${e.number} is open — ${e.invited.length} suppliers notified by email and SMS`);
  };

  const submitResponse = (id: string, r: Omit<EventResponse, 'id' | 'revision' | 'submittedAt' | 'submittedBy' | 'valid' | 'invalidReason'>, by: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'OPEN') return fail('This event is not open for responses');
    if (e.kind === 'AUCTION' || e.kind === 'REVERSE_AUCTION') return fail('Auctions take live bids, not sealed responses');
    if (TODAY < e.opens) return fail(`Responses open on ${e.opens}`);
    if (TODAY > e.closes) return fail('The closing date has passed');
    if (!e.invited.some((i) => i.supplierId === r.supplierId)) return fail('Only invited suppliers can respond');
    if (!supplierOk(r.supplierId)) return fail('This supplier is suspended or not approved');
    if (r.onBehalf && !buyer()) return fail('Only a buyer can submit on behalf of a supplier');
    const lines = eventLines(e);
    if (e.kind !== 'RFI' && !lines.some((l) => (r.prices[l.id] ?? 0) > 0)) return fail('Price at least one line');
    if (Object.values(r.prices).some((p) => p < 0)) return fail('Prices cannot be negative');
    if (r.leadDays < 0) return fail('Lead time cannot be negative');
    const missing = e.questionnaire.flatMap((sec) => sec.questions).filter((q) => q.required && !(r.answers[q.id] ?? '').trim());
    if (missing.length) return fail(`Answer every required question — ${missing.length} left, e.g. "${missing[0].text}"`);
    const prev = e.responses.filter((x) => x.supplierId === r.supplierId);
    const rec: EventResponse = { ...r, id: uid('rs'), revision: prev.length + 1, submittedAt: now(), submittedBy: by, valid: true };
    setEvent(id, (x) => ({ responses: [...x.responses, rec] }), `Response from ${party(r.supplierId)?.name} (revision ${rec.revision})`, r.onBehalf ? `Keyed by ${by} on behalf of the supplier` : undefined);
    c.notifyRole('OFFICER', `${e.number}: response from ${party(r.supplierId)?.name}`, `Revision ${rec.revision} received`, e.number);
    return done('Response submitted', `${party(r.supplierId)?.name} — revision ${rec.revision} for ${e.number}`, rec.id);
  };

  const disqualify = (id: string, responseId: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Purchasing decides on invalid bids');
    if (!reason.trim()) return fail('Give the reason the bid is invalid');
    const e = ev(id);
    const r = e?.responses.find((x) => x.id === responseId);
    if (!e || !r) return fail('Response not found');
    setEvent(id, (x) => ({ responses: x.responses.map((y) => (y.supplierId === r.supplierId ? { ...y, valid: false, invalidReason: reason } : y)) }), `Bid from ${party(r.supplierId)?.name} marked invalid`, reason);
    c.notifySupplier(r.supplierId, `${e.number}: your response was not accepted`, reason, e.number);
    return done('Bid marked invalid', party(r.supplierId)?.name ?? '');
  };

  const reinstate = (id: string, supplierId: string): Result => {
    if (!buyer()) return fail('Purchasing decides on invalid bids');
    setEvent(id, (x) => ({ responses: x.responses.map((y) => (y.supplierId === supplierId ? { ...y, valid: true, invalidReason: undefined } : y)) }), `Bid from ${party(supplierId)?.name} reinstated`);
    return { ok: true };
  };

  const postMessage = (id: string, text: string, opts: { side: 'BUYER' | 'SUPPLIER'; supplierId?: string; public: boolean; from: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (!text.trim()) return fail('Write a message');
    if (e.status === 'CANCELLED' || e.status === 'AWARDED') return fail('The message board is closed');
    if (opts.side === 'SUPPLIER' && !e.invited.some((i) => i.supplierId === opts.supplierId)) return fail('Only invited suppliers can post');
    if (opts.side === 'BUYER' && !buyer()) return fail('Switch to a buyer to answer suppliers');
    setEvent(id, (x) => ({ messages: [...x.messages, { id: uid('m'), from: opts.from, side: opts.side, supplierId: opts.supplierId, text: text.trim(), at: now(), public: opts.side === 'BUYER' ? opts.public : false }] }), opts.side === 'BUYER' ? (opts.public ? 'Clarification posted to all suppliers' : 'Reply posted') : 'Question from a supplier');
    if (opts.side === 'BUYER') {
      const to = opts.public ? e.invited.map((i) => i.supplierId) : opts.supplierId ? [opts.supplierId] : [];
      for (const x of to) c.notifySupplier(x, `${e.number}: message from the buyer`, text.trim(), e.number);
    } else c.notifyRole('OFFICER', `${e.number}: question from ${party(opts.supplierId ?? '')?.name}`, text.trim(), e.number);
    return done('Message posted', e.number);
  };

  const remind = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e || e.status !== 'OPEN') return fail('Reminders go out while the event is open');
    const waiting = e.invited.filter((i) => !e.responses.some((r) => r.supplierId === i.supplierId) && !e.bids.some((b) => b.supplierId === i.supplierId));
    if (!waiting.length) return fail('Every invited supplier has responded');
    for (const w of waiting) c.notifySupplier(w.supplierId, `Reminder: ${e.number} closes ${e.auction ? new Date(e.auction.end).toLocaleString('en-GB') : e.closes}`, `We have not yet received your response to ${e.title}.`, e.number, true);
    setEvent(id, (x) => ({ invited: x.invited.map((i) => (waiting.some((w) => w.supplierId === i.supplierId) ? { ...i, reminded: (i.reminded ?? 0) + 1 } : i)) }), `Reminder sent to ${waiting.length} suppliers`);
    return done('Reminders sent', `${waiting.length} suppliers reminded by email and SMS`);
  };

  const close = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!buyer()) return fail('Purchasing closes events');
    const e = ev(id);
    if (!e || e.status !== 'OPEN') return fail('Only open events can be closed');
    setEvent(id, () => ({ status: 'CLOSED', closes: e.closes > TODAY ? TODAY : e.closes, auction: e.auction ? { ...e.auction, end: new Date(Math.min(Date.now(), new Date(e.auction.end).getTime())).toISOString() } : undefined }), 'Closed for responses', `${latestResponses(e).length} responses, ${e.bids.length} bids`);
    return done('Event closed', `${e.number} — evaluate and award`);
  };

  const startEvaluation = (id: string, panel: string[]): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'OFFICER') return fail('Purchasing sets up the evaluation panel');
    const e = ev(id);
    if (!e || e.status !== 'CLOSED') return fail('Close the event before evaluating');
    if (!panel.length) return fail('Name at least one evaluator');
    setEvent(id, () => ({ status: 'EVALUATION', panel }), 'Evaluation started', `Panel: ${panel.join(', ')}`);
    for (const p of panel) c.notifyRole(p === 'Amina Hassan' ? 'DIRECTOR' : p === 'Lucy Njeri' ? 'MANAGER' : 'OFFICER', `${e.number}: please score the responses`, e.title, e.number);
    return done('Evaluation started', `${panel.length} evaluators notified`);
  };

  const score = (id: string, supplierId: string, scores: Record<string, number>, comment: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'EVALUATION') return fail('Scoring opens when the evaluation starts');
    if (!e.panel.includes(c.actor.name)) return fail(`${c.actor.name} is not on the evaluation panel`);
    if (Object.values(scores).some((v) => v < 0 || v > 5)) return fail('Scores are from 0 to 5');
    if (!latestResponses(e).some((r) => r.supplierId === supplierId)) return fail('This supplier has no valid response');
    setEvent(id, (x) => ({ evaluations: [...x.evaluations.filter((v) => !(v.evaluator === c.actor.name && v.supplierId === supplierId)), { id: uid('se'), evaluator: c.actor.name, supplierId, scores, comment, at: now() }] }), `Scored ${party(supplierId)?.name}`, comment || undefined);
    return done('Scores saved', `${party(supplierId)?.name} by ${c.actor.name}`);
  };

  const placeBid = (id: string, supplierId: string, amount: number, by: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    const problem = bidProblem(e, supplierId, amount);
    if (problem) return fail(problem);
    const ext = extendedEnd(e);
    setEvent(
      id,
      (x) => ({ bids: [...x.bids, { id: uid('b'), supplierId, amount: round2(amount), at: new Date().toISOString(), by }], auction: { ...x.auction!, end: ext.end, extensions: x.auction!.extensions + (ext.extended ? 1 : 0) } }),
      `Bid ${round2(amount).toLocaleString()} from ${party(supplierId)?.name}`,
      ext.extended ? `Closing extended by ${e.auction!.extendMinutes} minutes` : undefined
    );
    return done(ext.extended ? 'Bid placed — auction extended' : 'Bid placed', `${round2(amount).toLocaleString()} for ${e.number}`);
  };

  /** RFI → RFP → RFQ → auction: a new draft carrying the lots, questionnaire and invited suppliers. */
  const convert = (id: string, kind: EventKind): Result => {
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.kind === kind) return fail('Choose a different format');
    if (e.convertedTo) return fail('This event was already converted');
    if (e.status === 'AWARDED' || e.status === 'CANCELLED') return fail('Awarded or cancelled events cannot be converted');
    const auction = kind === 'AUCTION' || kind === 'REVERSE_AUCTION';
    const start = Date.now() + 3_600_000;
    const best = latestResponses(e).map((r) => responseTotal(e, r)).filter((t) => t > 0);
    const r = createEvent(
      {
        title: e.title,
        kind,
        category: e.category,
        businessUnit: e.businessUnit,
        opens: TODAY,
        closes: addDays(TODAY, auction ? 1 : 7),
        lots: clone(e.lots),
        questionnaire: auction ? [] : clone(e.questionnaire),
        priceWeight: auction ? 100 : e.priceWeight,
        terms: e.terms,
        auction: auction ? { start: new Date(start).toISOString(), end: new Date(start + 3_600_000).toISOString(), extendMinutes: 3, extendWindowMinutes: 2, minDecrementPct: 1, showRank: 'RANK', reservePrice: best.length ? Math.min(...best) : undefined } : undefined
      },
      { convertedFrom: e.id, invited: e.invited.filter((i) => supplierOk(i.supplierId)).map((i) => ({ supplierId: i.supplierId, at: now(), by: c.actor.name })) }
    );
    if (!r.ok || !r.id) return r;
    setEvent(id, () => ({ convertedTo: r.id, status: e.status === 'OPEN' ? 'CLOSED' : e.status }), `Converted to ${EVENT_KIND_LABEL[kind]}`, get().events.find((x) => x.id === r.id)?.number);
    return r;
  };

  const cancel = (id: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Only the Commercial Manager can cancel a sourcing event');
    if (!reason.trim()) return fail('Give the reason for cancelling');
    const e = ev(id);
    if (!e || e.status === 'AWARDED' || e.status === 'CANCELLED') return fail('This event cannot be cancelled');
    setEvent(id, () => ({ status: 'CANCELLED' }), 'Cancelled', reason);
    for (const i of e.invited) c.notifySupplier(i.supplierId, `${e.number} cancelled`, reason, e.number);
    return done('Event cancelled', e.number);
  };

  /** Unit price a supplier gets for a line: its sealed response, or its auction bid spread over the lines by quantity. */
  const awardPrice = (e: SourcingEvent, supplierId: string, lineId: string) => {
    const l = eventLines(e).find((x) => x.id === lineId)!;
    if (e.auction) {
      const best = Math.min(...e.bids.filter((b) => b.supplierId === supplierId).map((b) => b.amount));
      if (!Number.isFinite(best)) return 0;
      const totalQty = eventLines(e).reduce((s, x) => s + x.qty, 0) || 1;
      return round2(best / totalQty);
    }
    const r = latestResponses(e).find((x) => x.supplierId === supplierId);
    return r ? linePrice(r, lineId, l.qty) : 0;
  };

  /**
   * Award to one or several suppliers. Lines that came from requisitions are ordered against them (so the
   * requisition shows the purchase orders); other lines become draft purchase orders. Optionally drafts a contract.
   */
  const award = (id: string, allocations: { supplierId: string; lineIds: string[] }[], reason: string, makeContract: boolean): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Awards are made by the Commercial Manager or Finance Director');
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (e.status !== 'CLOSED' && e.status !== 'EVALUATION') return fail('Close the event before awarding');
    const allocs = allocations.filter((a) => a.lineIds.length);
    if (!allocs.length) return fail('Allocate at least one line to a supplier');
    const seen = new Set<string>();
    for (const a of allocs)
      for (const l of a.lineIds) {
        if (seen.has(l)) return fail('A line can only be awarded to one supplier');
        seen.add(l);
        if (!(awardPrice(e, a.supplierId, l) > 0)) return fail(`${party(a.supplierId)?.name} did not price ${eventLines(e).find((x) => x.id === l)?.description}`);
      }
    for (const a of allocs) if (!supplierOk(a.supplierId)) return fail(`${party(a.supplierId)?.name} is not an approved supplier`);
    const cheapestTotal = Math.min(...latestResponses(e).map((r) => responseTotal(e, r)).filter((t) => t > 0));
    const awardTotal = allocs.reduce((s, a) => s + a.lineIds.reduce((x, lid) => x + awardPrice(e, a.supplierId, lid) * (eventLines(e).find((l) => l.id === lid)?.qty ?? 0), 0), 0);
    if (!e.auction && Number.isFinite(cheapestTotal) && awardTotal > cheapestTotal + 0.5 && !reason.trim()) return fail('This award costs more than the lowest complete bid — record the reason');
    const awards: SourcingEvent['awards'] = [];
    const contracts: Contract[] = [];
    for (const a of allocs) {
      const lines = eventLines(e).filter((l) => a.lineIds.includes(l.id));
      const poIds: string[] = [];
      const resp = latestResponses(e).find((r) => r.supplierId === a.supplierId);
      // Requisition lines: order against the requisition
      const byReq = new Map<string, typeof lines>();
      for (const l of lines.filter((x) => x.reqId)) byReq.set(l.reqId!, [...(byReq.get(l.reqId!) ?? []), l]);
      for (const [reqId, ls] of byReq) {
        const res = c.com.award(reqId, a.supplierId, reason || `Awarded through ${e.number}`, { lineIds: ls.map((l) => l.reqLineId!), prices: Object.fromEntries(ls.map((l) => [l.reqLineId!, awardPrice(e, a.supplierId, l.id)])), leadDays: resp?.leadDays, eventId: e.id });
        if (!res.ok) return res;
        if (res.id) poIds.push(res.id);
      }
      const free = lines.filter((x) => !x.reqId);
      if (free.length) {
        const res = c.com.savePO({
          supplierId: a.supplierId,
          expected: addDays(TODAY, resp?.leadDays ?? 10),
          notes: `Awarded through ${e.number}${reason ? ` — ${reason}` : ''}`,
          lines: free.map((l) => ({ id: uid('pl'), sku: l.sku ?? '', description: l.description, qty: l.qty, price: awardPrice(e, a.supplierId, l.id), discountPct: 0 }))
        });
        if (!res.ok) return res;
        if (res.id) poIds.push(res.id);
      }
      const value = round2(lines.reduce((s, l) => s + l.qty * awardPrice(e, a.supplierId, l.id), 0));
      let contractId: string | undefined;
      if (makeContract) {
        const s = get();
        const { number, sequence } = next({ ...s, sequence: { ...s.sequence, CT: (s.sequence.CT ?? 0) + contracts.length } }, 'CT');
        contractId = uid('ct');
        const body = `CONTRACT FROM AWARD ${e.number}\n\nSupplier: ${party(a.supplierId)?.name}\nScope: ${e.title}\n${lines.map((l) => `- ${l.description}: ${l.qty} ${l.uom} at KES ${awardPrice(e, a.supplierId, l.id).toLocaleString()}`).join('\n')}\n\n${e.terms}`;
        contracts.push({
          id: contractId,
          number,
          title: `${e.title} — ${party(a.supplierId)?.name}`,
          supplierId: a.supplierId,
          type: e.category === 'Services' || e.category === 'Logistics' ? 'SERVICE' : 'FRAMEWORK',
          start: TODAY,
          end: addDays(TODAY, 365),
          valueCap: value,
          items: lines.filter((l) => l.sku).map((l) => ({ sku: l.sku!, description: l.description, unitPrice: awardPrice(e, a.supplierId, l.id), uom: l.uom, qtyCap: l.qty })),
          sites: [],
          customFields: { 'Sourcing event': e.number },
          status: 'DRAFT',
          version: 1,
          versions: [{ n: 1, body, by: c.actor.name, at: now(), note: 'Drafted from award' }],
          comments: [],
          signatures: [],
          risks: [],
          approvals: [],
          preparedBy: c.actor.name,
          eventId: e.id,
          retentionYears: 7,
          access: 'PROCUREMENT',
          history: [log('Created from award', e.number)]
        });
        void sequence;
      }
      awards.push({ supplierId: a.supplierId, lineIds: a.lineIds, value, poIds, contractId });
      c.notifySupplier(a.supplierId, `Award: ${e.number}`, `You have been awarded ${a.lineIds.length} line(s) worth KES ${value.toLocaleString()}. A purchase order follows.`, e.number);
    }
    for (const i of e.invited.filter((x) => !allocs.some((a) => a.supplierId === x.supplierId))) c.notifySupplier(i.supplierId, `${e.number}: outcome`, 'Thank you for your response. On this occasion the award went to another supplier.', e.number);
    const s = get();
    commit({
      ...s,
      sequence: { ...s.sequence, CT: (s.sequence.CT ?? 0) + contracts.length },
      contracts: [...contracts, ...s.contracts],
      events: s.events.map((x) => (x.id === id ? { ...x, status: 'AWARDED', awards, history: [...x.history, log(`Awarded to ${allocs.map((a) => party(a.supplierId)?.name).join(', ')}`, reason || undefined)] } : x))
    });
    return done('Award made', `${awards.reduce((n, a) => n + a.poIds.length, 0)} purchase order(s) drafted${contracts.length ? `, ${contracts.length} contract(s) drafted` : ''}`);
  };

  /** Post-award: put the winning prices into the supplier catalogue so requisitioners buy at them. */
  const addAwardToCatalogue = (id: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Catalogue prices are approved by the Commercial Manager');
    const e = ev(id);
    if (!e || e.status !== 'AWARDED') return fail('Award the event first');
    const s = get();
    const items = e.awards.flatMap((a) =>
      eventLines(e)
        .filter((l) => a.lineIds.includes(l.id) && l.sku)
        .map((l) => ({ id: uid('sc'), supplierId: a.supplierId, sku: l.sku, supplierSku: `${e.number}-${l.sku}`, description: l.description, uom: l.uom, price: awardPrice(e, a.supplierId, l.id), leadDays: 7, status: 'APPROVED' as const, submittedAt: now(), decidedBy: c.actor.name }))
    );
    if (!items.length) return fail('No catalogue items on this award');
    commit({ ...s, catalogue: [...s.catalogue.filter((x) => !items.some((i) => i.supplierId === x.supplierId && i.sku === x.sku)), ...items], events: s.events.map((x) => (x.id === id ? { ...x, history: [...x.history, log('Award prices added to the catalogue')] } : x)) });
    return done('Catalogue updated', `${items.length} item price(s) from ${e.number}`);
  };

  const saveAsTemplate = (id: string, name: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const e = ev(id);
    if (!e) return fail('Event not found');
    if (!name.trim()) return fail('Name the template');
    const s = get();
    commit({ ...s, rfxTemplates: [...s.rfxTemplates, { id: uid('tpl'), name: name.trim(), kind: e.kind, category: e.category, lots: clone(e.lots).map((l) => ({ ...l, lines: l.lines.map((x) => ({ ...x, reqId: undefined, reqLineId: undefined })) })), questionnaire: clone(e.questionnaire), terms: e.terms }] });
    return done('Template saved', name);
  };

  const importLines = (id: string, rows: Record<string, string>[]) => {
    const e = ev(id);
    const errors: string[] = [];
    if (!e || e.status !== 'DRAFT') return { imported: 0, errors: ['Lines can be imported into draft events only'] };
    const lots = clone(e.lots);
    let imported = 0;
    rows.forEach((r, i) => {
      const qty = Number(r.qty);
      if (!r.description?.trim() && !r.sku?.trim()) return errors.push(`Row ${i + 2}: description or sku is needed`);
      if (!(qty > 0)) return errors.push(`Row ${i + 2}: qty must be a number above zero`);
      const p = c.com.state.products.find((x) => x.sku === r.sku?.trim());
      if (r.sku?.trim() && !p) return errors.push(`Row ${i + 2}: unknown item ${r.sku}`);
      const lotName = r.lot?.trim() || 'Imported lines';
      let lot = lots.find((l) => l.name === lotName);
      if (!lot) {
        lot = { id: uid('lot'), name: lotName, lines: [] };
        lots.push(lot);
      }
      lot.lines.push({ id: uid('el'), sku: p?.sku, description: r.description?.trim() || p!.name, qty, uom: r.uom?.trim() || p?.unit || 'each', spec: r.spec?.trim() || undefined });
      imported++;
    });
    if (imported) setEvent(id, () => ({ lots }), `Imported ${imported} lines from a spreadsheet`);
    return { imported, errors };
  };

  return { createEvent, updateEvent, eventFromRequisitions, copyEvent, invite, uninvite, publish, submitResponse, disqualify, reinstate, postMessage, remind, close, startEvaluation, score, placeBid, convert, cancel, award, awardPrice, addAwardToCatalogue, saveAsTemplate, importLines };
};
