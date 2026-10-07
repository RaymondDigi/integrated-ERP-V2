import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  ShieldAlert,
  Lightbulb,
  TrendingUp,
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Bot,
  RotateCcw,
  UserCheck
} from 'lucide-react';
import type { LeaveRequest } from '../../types';
import {
  detectIssues,
  buildInsights,
  buildSuggestions,
  profileCompleteness,
  parseLeaveMessage,
  mergeDraft,
  evaluateLeave,
  describeDraft,
  balanceSummary,
  type AiContext,
  type AiAction,
  type AiFinding,
  type AiInsight,
  type LeaveDraft,
  type LeaveEvaluation
} from './aiEngine';
import { ESS_EMPLOYEE, formatDate } from './essData';

export type OnAiAction = (a: AiAction) => void;

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const SEVERITY_ICON = { high: XCircle, medium: AlertTriangle, low: Info };
const TONE_ICON = { positive: CheckCircle2, info: Info, warning: AlertTriangle };

const ActionButton: React.FC<{ action?: AiAction; onAction: OnAiAction; primary?: boolean }> = ({ action, onAction, primary }) =>
  action ? (
    <button className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm ai-action`} onClick={() => onAction(action)}>
      {action.kind === 'agent' && <Sparkles size={13} />}
      {action.label}
      {action.kind === 'goto' && <ChevronRight size={13} />}
    </button>
  ) : null;

export const CompletenessRing: React.FC<{ percent: number; size?: number }> = ({ percent, size = 64 }) => {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tone = percent >= 90 ? 'good' : percent >= 70 ? 'ok' : 'low';
  return (
    <span className={`ai-ring tone-${tone}`} style={{ width: size, height: size }} aria-label={`Profile ${percent}% complete`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ai-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ai-ring-value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{percent}%</b>
    </span>
  );
};

const FindingRow: React.FC<{ f: AiFinding; onAction: OnAiAction }> = ({ f, onAction }) => {
  const Icon = SEVERITY_ICON[f.severity];
  return (
    <li className={`ai-finding sev-${f.severity}`}>
      <span className="ai-finding-icon">
        <Icon size={16} />
      </span>
      <div className="ai-finding-body">
        <div className="ai-finding-top">
          <span className="ai-area">{f.area}</span>
          <strong>{f.title}</strong>
        </div>
        <p>{f.detail}</p>
      </div>
      <ActionButton action={f.action} onAction={onAction} primary={f.severity === 'high'} />
    </li>
  );
};

const InsightRow: React.FC<{ i: AiInsight; onAction: OnAiAction }> = ({ i, onAction }) => {
  const Icon = TONE_ICON[i.tone];
  return (
    <li className={`ai-insight tone-${i.tone}`}>
      <span className="ai-insight-icon">
        <Icon size={15} />
      </span>
      <div>
        <strong>{i.title}</strong>
        <p>{i.detail}</p>
      </div>
      <ActionButton action={i.action} onAction={onAction} />
    </li>
  );
};

/* ------------------------------------------------------------------ */
/* Home: compact AI insights card                                      */
/* ------------------------------------------------------------------ */

export const AiHomeCard: React.FC<{ ctx: AiContext; onAction: OnAiAction; onOpen: () => void }> = ({ ctx, onAction, onOpen }) => {
  const findings = useMemo(() => detectIssues(ctx), [ctx]);
  const insights = useMemo(() => buildInsights(ctx), [ctx]);
  const suggestions = useMemo(() => buildSuggestions(ctx), [ctx]);
  const completeness = profileCompleteness(ctx.profile);
  const top: { kind: 'f' | 'i'; f?: AiFinding; i?: AiInsight }[] = [
    ...findings.filter((f) => f.severity === 'high').map((f) => ({ kind: 'f' as const, f })),
    ...suggestions.slice(0, 1).map((i) => ({ kind: 'i' as const, i })),
    ...insights.filter((i) => i.tone === 'warning').map((i) => ({ kind: 'i' as const, i }))
  ].slice(0, 3);

  return (
    <section className="ai-home">
      <div className="ai-home-head">
        <div className="ai-title">
          <span className="ai-spark">
            <Sparkles size={16} />
          </span>
          <div>
            <h3>AI Insights</h3>
            <span>
              {findings.length} issue{findings.length === 1 ? '' : 's'} detected · {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="ai-home-profile" title="Profile completeness">
          <CompletenessRing percent={completeness.percent} size={44} />
          <div>
            <strong>Profile</strong>
            <span>{completeness.missing.length ? `${completeness.missing.length} items missing` : 'Complete'}</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onOpen}>
          Open assistant <ChevronRight size={13} />
        </button>
      </div>
      <ul className="ai-home-list">
        {top.map((t) =>
          t.kind === 'f' && t.f ? <FindingRow key={t.f.id} f={t.f} onAction={onAction} /> : t.i ? <InsightRow key={t.i.id} i={t.i} onAction={onAction} /> : null
        )}
      </ul>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Profile completeness card (Profile tab + Assistant)                 */
/* ------------------------------------------------------------------ */

export const ProfileCompletenessCard: React.FC<{ ctx: AiContext; onAction?: OnAiAction }> = ({ ctx, onAction }) => {
  const c = profileCompleteness(ctx.profile);
  return (
    <section className={`ai-complete ${c.percent === 100 ? 'done' : ''}`}>
      <CompletenessRing percent={c.percent} />
      <div className="ai-complete-body">
        <strong>{c.percent === 100 ? 'Your profile is complete' : `Profile ${c.percent}% complete`}</strong>
        {c.missing.length > 0 ? (
          <>
            <span>Missing information detected:</span>
            <div className="ai-chip-row">
              {c.missing.map((m) => (
                <span key={m.key} className="ai-missing-chip">
                  {m.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <span>HR has everything it needs. Thank you!</span>
        )}
      </div>
      {onAction && c.missing.length > 0 && (
        <button className="btn btn-primary btn-sm" onClick={() => onAction({ kind: 'goto', tab: 'profile', label: 'Complete profile' })}>
          <UserCheck size={14} /> Complete profile
        </button>
      )}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Leave Agent                                                         */
/* ------------------------------------------------------------------ */

interface ChatMsg {
  id: number;
  role: 'agent' | 'user';
  text: string;
  plan?: { draft: LeaveDraft; evaluation: LeaveEvaluation };
  done?: boolean;
}

const PROMPTS = [
  '3 days from 26 Oct for a family wedding',
  'Take next Friday off',
  "I'm sick today",
  'Plan a long weekend around Mashujaa Day',
  "What's my leave balance?"
];

export interface SubmitLeave {
  leaveType: LeaveRequest['leaveType'];
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}

export const LeaveAgent: React.FC<{
  ctx: AiContext;
  onSubmit: (r: SubmitLeave) => void;
  initialPrompt?: string | null;
  onPromptConsumed?: () => void;
}> = ({ ctx, onSubmit, initialPrompt, onPromptConsumed }) => {
  const firstName = ESS_EMPLOYEE.preferredName;
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    {
      id: 0,
      role: 'agent',
      text: `Hi ${firstName}, I'm your Leave Agent. Tell me when you'd like time off in your own words — I'll check your balance, public holidays and team cover, then draft the application for you.`
    }
  ]);
  const [draft, setDraft] = useState<LeaveDraft>({});
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, thinking]);

  const say = (m: Omit<ChatMsg, 'id'>) => setMsgs((prev) => [...prev, { ...m, id: idRef.current++ }]);

  const submitDraft = (d: LeaveDraft) => {
    const ev = evaluateLeave(d, ctx);
    if (!ev.ready || !d.start || !d.end || !d.reason) return;
    onSubmit({ leaveType: d.leaveType ?? 'Annual Leave', startDate: d.start, endDate: d.end, daysCount: ev.workingDays, reason: d.reason });
    setMsgs((prev) => prev.map((m) => (m.plan ? { ...m, done: true } : m)));
    say({
      role: 'agent',
      text: `Done — your ${(d.leaveType ?? 'Annual Leave').toLowerCase()} for ${ev.workingDays} day${ev.workingDays === 1 ? '' : 's'} is submitted to ${ESS_EMPLOYEE.manager.split(' (')[0]}. You'll see it under My Leave as "Pending approval".`
    });
    setDraft({});
  };

  const respond = (text: string) => {
    const lower = text.toLowerCase().trim();

    if (/^(cancel|start over|reset|never ?mind)\b/.test(lower)) {
      setDraft({});
      say({ role: 'agent', text: 'No problem — I cleared that. What would you like to plan instead?' });
      return;
    }
    if (/^(yes|submit|confirm|go ahead|send( it)?|ok(ay)?|sure)\b/.test(lower) && draft.start) {
      const ev = evaluateLeave(draft, ctx);
      if (ev.ready) return submitDraft(draft);
    }
    if (/\b(balance|how many days|days (do i have )?left|remaining)\b/.test(lower) && !/\d/.test(lower)) {
      say({ role: 'agent', text: `Here's what you have:\n${balanceSummary(ctx.balances)}` });
      return;
    }

    const parsed = parseLeaveMessage(text, ctx.today ?? new Date());
    // A plain reply while we're waiting for a reason becomes the reason
    const awaitingReason = !!draft.start && !draft.reason;
    if (awaitingReason && !parsed.start && !parsed.days && !parsed.reason && lower.length > 2) {
      parsed.reason = text.trim().charAt(0).toUpperCase() + text.trim().slice(1);
    }
    const next = mergeDraft(draft, parsed);
    setDraft(next);
    const ev = evaluateLeave(next, ctx);

    if (ev.missing.includes('dates')) {
      say({
        role: 'agent',
        text: `Got it — ${(next.leaveType ?? 'annual leave').toLowerCase()}. Which dates? You can say things like "next Monday to Wednesday", "3 days from 26 Oct" or "next week".`
      });
      return;
    }

    const notes: string[] = [];
    if (next.assumedSingleDay) notes.push('I assumed one day — tell me if you need longer (e.g. "make it 3 days").');
    if (ev.missing.includes('reason')) notes.push('What is the reason? A short note is enough, e.g. "family visit".');
    else if (ev.ready) notes.push('Reply "submit" or use the button to send it for approval.');
    else notes.push('This plan has a problem — adjust the dates or type and I will re-check.');

    say({
      role: 'agent',
      text: `Here's the plan — ${describeDraft(next)}, ${ev.workingDays} working day${ev.workingDays === 1 ? '' : 's'} (${ev.calendarDays} calendar).`,
      plan: { draft: next, evaluation: ev }
    });
    if (ev.tip) say({ role: 'agent', text: ev.tip });
    say({ role: 'agent', text: notes.join(' ') });
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || thinking) return;
    say({ role: 'user', text: t });
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      setThinking(false);
      respond(t);
    }, 450);
  };

  // Prompts handed over from suggestions ("Draft with Leave Agent")
  useEffect(() => {
    if (initialPrompt) {
      send(initialPrompt);
      onPromptConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  return (
    <section className="ai-agent">
      <header className="ai-agent-head">
        <span className="ai-bot">
          <Bot size={18} />
        </span>
        <div>
          <h3>AI Leave Agent</h3>
          <span>Plans, checks and drafts leave applications</span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setDraft({});
            say({ role: 'agent', text: 'Fresh start. When would you like time off?' });
          }}
          title="Start over"
        >
          <RotateCcw size={14} />
        </button>
      </header>

      <div className="ai-chat" ref={listRef} aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role}`}>
            {m.text && <div className="ai-bubble">{m.text}</div>}
            {m.plan && (
              <div className={`ai-plan ${m.done ? 'done' : ''}`}>
                <div className="ai-plan-top">
                  <strong>{describeDraft(m.plan.draft)}</strong>
                  <span>
                    {m.plan.evaluation.workingDays} day{m.plan.evaluation.workingDays === 1 ? '' : 's'}
                  </span>
                </div>
                {m.plan.draft.reason && <p className="ai-plan-reason">“{m.plan.draft.reason}”</p>}
                <ul>
                  {m.plan.evaluation.checks.map((c, i) => (
                    <li key={i} className={c.ok ? 'ok' : 'bad'}>
                      {c.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      <span>
                        <b>{c.label}</b>
                        {c.detail ? ` — ${c.detail}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {!m.done && m.plan.evaluation.ready && m.plan.draft.reason && (
                  <div className="ai-plan-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => submitDraft(m.plan!.draft)}>
                      <Send size={13} /> Submit for approval
                    </button>
                  </div>
                )}
                {m.done && <span className="ai-plan-done">Submitted</span>}
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="ai-msg agent">
            <div className="ai-bubble ai-typing" aria-label="Agent is typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <div className="ai-prompts">
        {PROMPTS.map((p) => (
          <button key={p} onClick={() => send(p)} disabled={thinking}>
            {p}
          </button>
        ))}
      </div>

      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="form-control"
          placeholder='e.g. "Two days off from next Thursday for a family visit"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message the Leave Agent"
        />
        <button className="btn btn-primary" type="submit" disabled={!input.trim() || thinking} aria-label="Send">
          <Send size={15} />
        </button>
      </form>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Assistant tab                                                       */
/* ------------------------------------------------------------------ */

export const EssAiAssistant: React.FC<{
  ctx: AiContext;
  onAction: OnAiAction;
  onSubmitLeave: (r: SubmitLeave) => void;
  agentPrompt: string | null;
  onPromptConsumed: () => void;
}> = ({ ctx, onAction, onSubmitLeave, agentPrompt, onPromptConsumed }) => {
  const [scanAt, setScanAt] = useState(() => new Date());
  const [scanning, setScanning] = useState(false);
  const findings = useMemo(() => detectIssues(ctx), [ctx, scanAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const insights = useMemo(() => buildInsights(ctx), [ctx]);
  const suggestions = useMemo(() => buildSuggestions(ctx), [ctx]);
  const counts = { high: findings.filter((f) => f.severity === 'high').length, medium: findings.filter((f) => f.severity === 'medium').length, low: findings.filter((f) => f.severity === 'low').length };

  const rescan = () => {
    setScanning(true);
    window.setTimeout(() => {
      setScanAt(new Date());
      setScanning(false);
    }, 900);
  };

  return (
    <div className="ai-layout">
      <div className="ai-main">
        <LeaveAgent ctx={ctx} onSubmit={onSubmitLeave} initialPrompt={agentPrompt} onPromptConsumed={onPromptConsumed} />
      </div>

      <div className="ai-side">
        <ProfileCompletenessCard ctx={ctx} onAction={onAction} />

        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <ShieldAlert size={15} /> Error detection
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={rescan} disabled={scanning}>
              <RefreshCw size={13} className={scanning ? 'ai-spin' : ''} /> {scanning ? 'Scanning…' : 'Re-scan'}
            </button>
          </div>
          <div className="ai-scan-meta">
            <span>
              Scanned payslips, profile, leave, approvals, assets and appraisal ·{' '}
              {formatDate(scanAt.toISOString().slice(0, 10), { day: 'numeric', month: 'short' })}{' '}
              {scanAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="ai-sev-counts">
              {counts.high > 0 && <span className="sev-high">{counts.high} high</span>}
              {counts.medium > 0 && <span className="sev-medium">{counts.medium} medium</span>}
              {counts.low > 0 && <span className="sev-low">{counts.low} low</span>}
            </span>
          </div>
          {scanning ? (
            <div className="ai-scanning">
              <span className="ai-scan-bar" />
              Checking your records…
            </div>
          ) : findings.length === 0 ? (
            <div className="ess-empty">
              <CheckCircle2 size={28} />
              <strong>No problems found</strong>
              <span>Everything we checked looks consistent.</span>
            </div>
          ) : (
            <ul className="ai-list">
              {findings.map((f) => (
                <FindingRow key={f.id} f={f} onAction={onAction} />
              ))}
            </ul>
          )}
        </section>

        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <Lightbulb size={15} /> Suggestions
            </h3>
          </div>
          <ul className="ai-list">
            {suggestions.map((i) => (
              <InsightRow key={i.id} i={i} onAction={onAction} />
            ))}
          </ul>
        </section>

        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <TrendingUp size={15} /> Insights
            </h3>
          </div>
          <ul className="ai-list">
            {insights.map((i) => (
              <InsightRow key={i.id} i={i} onAction={onAction} />
            ))}
          </ul>
        </section>

        <p className="ess-hint ai-disclaimer">
          The assistant works only on your own records in this portal. Always review a draft before submitting.
        </p>
      </div>
    </div>
  );
};
