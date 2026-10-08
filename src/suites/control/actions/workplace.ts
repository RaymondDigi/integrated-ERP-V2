import { addDays, TODAY } from '../../finance/engine';
import { notify } from '../../../platform/outbox';
import { nextApprover, RULE_ROLES } from '../../../platform/rules';
import type { Announcement, CalEvent, LibraryDoc, Survey, SurveyQuestion } from '../types';
import type { ActionKit, Result } from './kit';

/** Document library, intranet, calendar and booking, surveys, polls and the suggestion box. */
export const workplaceActions = (k: ActionKit) => {
  const { get, commit, fail, done, log, uid, actor, me, trail } = k;

  /* ---------------- Document library ---------------- */
  const doc = (id: string) => get().docs.find((x) => x.id === id)!;
  const patchDoc = (id: string, patch: Partial<LibraryDoc>, action?: string, note?: string) => {
    const s = get();
    commit({ ...s, docs: s.docs.map((x) => (x.id === id ? { ...x, ...patch, history: action ? [...x.history, log(action, note)] : x.history } : x)) });
  };
  const createDoc = (d: Pick<LibraryDoc, 'title' | 'folder'> & { note: string; fileName?: string; dataUrl?: string; policyId?: string }): Result => {
    if (!d.title.trim() || !d.folder.trim()) return fail('Give the document a title and folder');
    const s = get();
    if (s.docs.some((x) => x.title.trim().toLowerCase() === d.title.trim().toLowerCase() && x.status !== 'OBSOLETE')) return fail('A document with that title is already in the library — check it out and add a version instead');
    const n = (s.sequence.DOC ?? 0) + 1;
    const id = uid('dc');
    commit({ ...s, sequence: { ...s.sequence, DOC: n }, docs: [{ id, number: `DOC-${String(n).padStart(4, '0')}`, title: d.title, folder: d.folder, owner: actor.name, status: 'DRAFT', versions: [{ v: 1, at: TODAY, by: actor.name, note: d.note || 'First draft', fileName: d.fileName, dataUrl: d.dataUrl }], comments: [], approvals: [], policyId: d.policyId, history: [log('Created')] }, ...s.docs] });
    trail('Documents', 'Document created', d.title);
    return done('Document created', d.title, id);
  };
  const checkOut = (id: string): Result => {
    const d = doc(id);
    if (d.checkedOutBy) return fail(`Checked out by ${d.checkedOutBy} since ${d.checkedOutAt}`);
    if (d.status === 'OBSOLETE') return fail('The document is obsolete');
    if (d.status === 'IN_REVIEW') return fail('The document is in review — wait for the decision');
    patchDoc(id, { checkedOutBy: actor.name, checkedOutAt: TODAY }, 'Checked out');
    return done('Checked out', `${d.number} is locked for you to edit`);
  };
  const checkIn = (id: string, note: string, file?: { fileName: string; dataUrl: string }): Result => {
    const d = doc(id);
    if (d.checkedOutBy !== actor.name) return fail(d.checkedOutBy ? `Only ${d.checkedOutBy} can check this in` : 'Check the document out first');
    if (!note.trim()) return fail('Say what changed in this version');
    const v = d.versions.length + 1;
    patchDoc(id, { checkedOutBy: undefined, checkedOutAt: undefined, status: 'DRAFT', approvals: [], versions: [...d.versions, { v, at: TODAY, by: actor.name, note, ...file }] }, `Checked in v${v}`, note);
    trail('Documents', 'New version checked in', d.number, { field: 'version', before: String(v - 1), after: String(v) });
    return done(`Version ${v} saved`, d.number);
  };
  const discardCheckout = (id: string): Result => {
    const d = doc(id);
    if (!d.checkedOutBy) return fail('Not checked out');
    if (d.checkedOutBy !== actor.name && !k.canApprove) return fail(`Only ${d.checkedOutBy} or a manager can release the lock`);
    patchDoc(id, { checkedOutBy: undefined, checkedOutAt: undefined }, 'Check-out released');
    return done('Lock released', d.number);
  };
  const commentDoc = (id: string, text: string): Result => {
    if (!text.trim()) return fail('Write a comment');
    const d = doc(id);
    patchDoc(id, { comments: [...d.comments, { at: TODAY, by: actor.name, text }] });
    if (d.owner !== actor.name) notify({ module: 'Documents', to: d.owner, subject: `Comment on ${d.title}`, body: text, ref: d.number });
    return { ok: true };
  };
  const submitDoc = (id: string): Result => {
    const d = doc(id);
    if (d.status !== 'DRAFT') return fail('Only drafts go for review');
    if (d.checkedOutBy) return fail('Check the document in first');
    if (d.owner !== actor.name) return fail(`The owner (${d.owner}) sends it for review`);
    patchDoc(id, { status: 'IN_REVIEW', approvals: [] }, 'Sent for review');
    const step = nextApprover('wf.document', 0, 0);
    notify({ module: 'Documents', to: RULE_ROLES[step.role] ?? step.role, subject: `Please review ${d.title} v${d.versions.length}`, ref: d.number });
    return done('Sent for review', `${RULE_ROLES[step.role] ?? step.role} approves`);
  };
  const decideDoc = (id: string, approve: boolean, note: string): Result => {
    const d = doc(id);
    if (d.status !== 'IN_REVIEW') return fail('Not in review');
    const step = nextApprover('wf.document', 0, d.approvals.length);
    if (actor.role !== step.role) return fail(`The ${RULE_ROLES[step.role] ?? step.role} approves documents (Approval rules)`);
    if (d.versions[d.versions.length - 1].by === actor.name || d.owner === actor.name) return fail('You wrote this version, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Say what must change');
    const approvals = approve ? [...d.approvals, { by: actor.name, role: actor.role, at: TODAY }] : [];
    const final = !approve || step.last;
    patchDoc(id, { status: !approve ? 'DRAFT' : final ? 'APPROVED' : 'IN_REVIEW', approvals, comments: note ? [...d.comments, { at: TODAY, by: actor.name, text: note }] : d.comments }, !approve ? 'Returned for changes' : final ? `Approved v${d.versions.length}` : 'First approval', note || undefined);
    notify({ module: 'Documents', to: d.owner, subject: `${d.title} ${!approve ? 'returned for changes' : final ? 'approved' : 'passed first approval'}`, body: note, ref: d.number });
    trail('Documents', approve ? 'Document approved' : 'Document returned', d.number, { note: note || undefined });
    return done(!approve ? 'Returned' : final ? 'Approved' : 'First approval recorded', d.number);
  };
  const shareDoc = (id: string, party: string, days: number): Result => {
    const d = doc(id);
    if (d.status !== 'APPROVED') return fail('Only approved documents can be shared outside the company');
    if (!party.trim()) return fail('Who is it shared with?');
    if (!(days >= 1 && days <= 90)) return fail('Links last between 1 and 90 days');
    const share = { party, token: `shr-${uid('').slice(-6)}`, expires: addDays(TODAY, days) };
    patchDoc(id, { share }, `Shared with ${party} until ${share.expires}`);
    trail('Documents', 'Shared externally', d.number, { note: `${party} until ${share.expires}` });
    return done('Link created', `${party} can read it until ${share.expires}`);
  };
  const revokeShare = (id: string): Result => {
    const d = doc(id);
    if (!d.share) return fail('Not shared');
    patchDoc(id, { share: undefined }, `Link for ${d.share.party} revoked`);
    return done('Link revoked', d.number);
  };
  const obsoleteDoc = (id: string): Result => {
    const d = doc(id);
    if (d.owner !== actor.name && actor.role !== 'SECRETARY') return fail('The owner or the Company Secretary withdraws documents');
    patchDoc(id, { status: 'OBSOLETE', share: undefined }, 'Withdrawn');
    return done('Withdrawn', d.number);
  };

  /* ---------------- Intranet ---------------- */
  const saveAnnouncement = (a: Pick<Announcement, 'title' | 'body' | 'audience' | 'pinned' | 'expires'> & { id?: string; publish: boolean }): Result => {
    if (!a.title.trim() || a.body.trim().length < 10) return fail('Give the announcement a title and some text');
    if (a.publish && !k.canApprove) return fail('Managers publish announcements — save it as a draft for them');
    if (a.expires && a.expires < TODAY) return fail('The expiry date has passed');
    const s = get();
    const rec = { title: a.title, body: a.body, audience: a.audience, pinned: a.pinned, expires: a.expires || undefined, status: (a.publish ? 'PUBLISHED' : 'DRAFT') as Announcement['status'] };
    if (a.id) {
      commit({ ...s, announcements: s.announcements.map((x) => (x.id === a.id ? { ...x, ...rec } : x)) });
    } else commit({ ...s, announcements: [{ ...rec, id: uid('an'), by: me, at: TODAY, reads: [] }, ...s.announcements] });
    if (a.publish) notify({ module: 'Intranet', to: a.audience, subject: `Announcement: ${a.title}`, body: a.body.slice(0, 140) });
    return done(a.publish ? 'Published' : 'Saved as draft', a.title);
  };
  const archiveAnnouncement = (id: string): Result => {
    if (!k.canApprove) return fail('Managers archive announcements');
    const s = get();
    commit({ ...s, announcements: s.announcements.map((x) => (x.id === id ? { ...x, status: 'ARCHIVED', pinned: false } : x)) });
    return done('Archived', '');
  };
  const markRead = (id: string) => {
    const s = get();
    const a = s.announcements.find((x) => x.id === id);
    if (!a || a.reads.includes(me)) return;
    commit({ ...s, announcements: s.announcements.map((x) => (x.id === id ? { ...x, reads: [...x.reads, me] } : x)) });
  };

  /* ---------------- Calendar and booking ---------------- */
  const overlaps = (a: Pick<CalEvent, 'start' | 'end'>, b: Pick<CalEvent, 'start' | 'end'>) => a.start < b.end && b.start < a.end;
  const saveEvent = (e: Omit<CalEvent, 'id' | 'owner'>): Result => {
    if (!e.title.trim()) return fail('Give the event a title');
    if (!e.start || !e.end || e.end <= e.start) return fail('The end must be after the start');
    const s = get();
    if (e.resourceId) {
      const r = s.resources.find((x) => x.id === e.resourceId)!;
      const clash = s.events.find((x) => x.resourceId === e.resourceId && overlaps(x, e));
      if (clash) return fail(`${r.name} is already booked for “${clash.title}” (${clash.start.slice(11)}–${clash.end.slice(11)})`);
      if (e.attendees.length > r.capacity) return fail(`${r.name} holds ${r.capacity}; ${e.attendees.length} attendees invited`);
    }
    const id = uid('ev');
    commit({ ...s, events: [...s.events, { ...e, id, owner: me }] });
    e.attendees.filter((p) => p !== me).forEach((p) => notify({ module: 'Calendar', to: p, subject: `Invitation: ${e.title}`, body: `${e.start.replace('T', ' ')} – ${e.end.slice(11)}${e.location ? ` · ${e.location}` : ''}` }));
    return done(e.resourceId ? 'Booked' : 'Event added', e.title, id);
  };
  const cancelEvent = (id: string): Result => {
    const s = get();
    const e = s.events.find((x) => x.id === id)!;
    if (e.owner !== me && !k.canApprove) return fail(`Only ${e.owner} can cancel this`);
    commit({ ...s, events: s.events.filter((x) => x.id !== id) });
    e.attendees.filter((p) => p !== me).forEach((p) => notify({ module: 'Calendar', to: p, subject: `Cancelled: ${e.title}` }));
    return done('Cancelled', e.title);
  };

  /* ---------------- Surveys, polls, suggestions ---------------- */
  const createSurvey = (sv: Pick<Survey, 'title' | 'kind' | 'targetDept' | 'audience' | 'period'> & { questions: Omit<SurveyQuestion, 'id'>[] }): Result => {
    if (!sv.title.trim()) return fail('Give the survey a title');
    const qs = sv.questions.filter((q) => q.text.trim());
    if (!qs.length) return fail('Add at least one question');
    if (qs.some((q) => q.type === 'CHOICE' && (q.options ?? []).filter(Boolean).length < 2)) return fail('Choice questions need at least two options');
    if (sv.kind === 'INTERNAL_CUSTOMER' && !sv.targetDept) return fail('Choose the department being rated');
    const s = get();
    const id = uid('sv');
    commit({ ...s, surveys: [{ ...sv, id, questions: qs.map((q, i) => ({ ...q, id: `q${i + 1}` })), responses: [], status: 'DRAFT', createdBy: me }, ...s.surveys] });
    return done('Survey created', 'Open it when you are ready for responses', id);
  };
  const setSurveyStatus = (id: string, status: 'OPEN' | 'CLOSED'): Result => {
    const s = get();
    const sv = s.surveys.find((x) => x.id === id)!;
    if (sv.createdBy !== me && !k.canApprove) return fail('Only the creator or a manager can open or close it');
    if (status === 'OPEN' && sv.status !== 'DRAFT') return fail('Only drafts can be opened');
    if (status === 'CLOSED' && sv.status !== 'OPEN') return fail('Only open surveys can be closed');
    commit({ ...s, surveys: s.surveys.map((x) => (x.id === id ? { ...x, status } : x)) });
    if (status === 'OPEN') notify({ module: 'Surveys', to: sv.audience, subject: `Please answer: ${sv.title}` });
    return done(status === 'OPEN' ? 'Survey open' : 'Survey closed', sv.title);
  };
  const respondSurvey = (id: string, dept: string, answers: Record<string, string | number>): Result => {
    const s = get();
    const sv = s.surveys.find((x) => x.id === id)!;
    if (sv.status !== 'OPEN') return fail('The survey is not open');
    if (sv.responses.some((r) => r.by === me)) return fail('You have already answered this survey');
    if (sv.kind === 'INTERNAL_CUSTOMER' && dept === sv.targetDept) return fail('Departments do not rate themselves');
    const missing = sv.questions.filter((q) => q.type !== 'TEXT' && (answers[q.id] === undefined || answers[q.id] === ''));
    if (missing.length) return fail(`Answer: ${missing.map((q) => q.text).join('; ')}`);
    commit({ ...s, surveys: s.surveys.map((x) => (x.id === id ? { ...x, responses: [...x.responses, { id: uid('rs'), by: me, dept, at: TODAY, answers }] } : x)) });
    return done('Thank you', 'Your response was recorded');
  };
  const createPoll = (question: string, options: string[], closes: string): Result => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return fail('A poll needs a question and at least two options');
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return fail('Options must be different');
    if (!closes || closes < TODAY) return fail('Choose a closing date from today');
    const s = get();
    commit({ ...s, polls: [{ id: uid('pl'), question, options: opts, votes: {}, createdBy: me, closes }, ...s.polls] });
    return done('Poll created', question);
  };
  const vote = (pollId: string, option: number): Result => {
    const s = get();
    const p = s.polls.find((x) => x.id === pollId)!;
    if (p.closes < TODAY) return fail('Voting has closed');
    if (p.votes[me] !== undefined) return fail('You have already voted');
    commit({ ...s, polls: s.polls.map((x) => (x.id === pollId ? { ...x, votes: { ...x.votes, [me]: option } } : x)) });
    return done('Vote counted', p.options[option]);
  };
  const addSuggestion = (text: string, dept: string, anonymous: boolean): Result => {
    if (text.trim().length < 10) return fail('Describe your suggestion (at least 10 characters)');
    const s = get();
    commit({ ...s, suggestions: [{ id: uid('sg'), text, by: anonymous ? undefined : me, dept, at: TODAY, votes: [], status: 'NEW' }, ...s.suggestions] });
    return done('Suggestion posted', anonymous ? 'Posted anonymously' : 'Colleagues can now vote for it');
  };
  const upvote = (id: string): Result => {
    const s = get();
    const g = s.suggestions.find((x) => x.id === id)!;
    if (g.votes.includes(me)) return fail('You already voted for this');
    if (g.by === me) return fail('You cannot vote for your own suggestion');
    commit({ ...s, suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, votes: [...x.votes, me] } : x)) });
    return { ok: true };
  };
  const respondSuggestion = (id: string, status: 'UNDER_REVIEW' | 'ADOPTED' | 'DECLINED', response: string): Result => {
    if (!k.canApprove) return fail('Managers respond to suggestions');
    if (status !== 'UNDER_REVIEW' && !response.trim()) return fail('Explain the decision');
    const s = get();
    const g = s.suggestions.find((x) => x.id === id)!;
    commit({ ...s, suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, status, response: response || x.response } : x)) });
    if (g.by) notify({ module: 'Suggestions', to: g.by, subject: `Your suggestion is ${status.replace('_', ' ').toLowerCase()}`, body: response });
    return done('Response saved', status.replace('_', ' ').toLowerCase());
  };

  return {
    createDoc,
    checkOut,
    checkIn,
    discardCheckout,
    commentDoc,
    submitDoc,
    decideDoc,
    shareDoc,
    revokeShare,
    obsoleteDoc,
    saveAnnouncement,
    archiveAnnouncement,
    markRead,
    saveEvent,
    cancelEvent,
    createSurvey,
    setSurveyStatus,
    respondSurvey,
    createPoll,
    vote,
    addSuggestion,
    upvote,
    respondSuggestion
  };
};
