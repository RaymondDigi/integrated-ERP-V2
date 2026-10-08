import React, { useState } from 'react';
import { MessageSquare, Smile, AlertTriangle, MapPin, Plus } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, fmtDate, round2, TODAY } from '../../finance/engine';
import type { Feedback } from '../tradeTypes';
import { Chips, DataTable, DefList, Drawer, Field, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { feedbackLate, journeyOf, JOURNEY, npsOf, SLA_DAYS } from '../tradeEngine';

type Tab = 'FEEDBACK' | 'SURVEYS' | 'VISITS' | 'JOURNEY';
const OWNERS = ['Peter Mwangi', 'Grace Wanjiru', 'John Kiprop'];

/** Customer experience: complaints and compliments with SLAs, NPS/CSAT surveys, buyer visits and the customer journey. */
export const CustomerExperiencePage: React.FC = () => {
  const { state } = useCommercial();
  const [tab, setTab] = useState<Tab>('FEEDBACK');
  const open = state.feedback.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS');
  const late = state.feedback.filter((f) => feedbackLate(f));
  const nps = npsOf(state.surveys.map((s) => s.nps));
  const csat = state.surveys.length ? round2(state.surveys.reduce((x, s) => x + s.csat, 0) / state.surveys.length) : null;
  return (
    <SuitePage eyebrow="Business development" title="Customer experience" subtitle="Every complaint has an owner and a deadline set by its severity; surveys and visit scores show how customers feel.">
      <div className="sx-stats">
        <Stat label="Open feedback" value={open.length} icon={<MessageSquare size={17} />} onClick={() => setTab('FEEDBACK')} />
        <Stat label="Past SLA" value={late.length} detail={`High ${SLA_DAYS.HIGH}d · medium ${SLA_DAYS.MEDIUM}d · low ${SLA_DAYS.LOW}d`} icon={<AlertTriangle size={17} />} tone={late.length ? 'red' : 'slate'} />
        <Stat label="Net promoter score" value={nps ?? '—'} detail={`${state.surveys.length} responses`} icon={<Smile size={17} />} tone="blue" onClick={() => setTab('SURVEYS')} />
        <Stat label="Satisfaction" value={csat ? `${csat}/5` : '—'} icon={<Smile size={17} />} tone="gold" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'FEEDBACK', label: 'Feedback', count: state.feedback.length },
            { value: 'SURVEYS', label: 'Surveys' },
            { value: 'VISITS', label: 'Visits & follow-ups' },
            { value: 'JOURNEY', label: 'Customer journey' }
          ]}
        />
      </div>
      {tab === 'FEEDBACK' && <FeedbackTab />}
      {tab === 'SURVEYS' && <Surveys />}
      {tab === 'VISITS' && <Visits />}
      {tab === 'JOURNEY' && <Journey />}
    </SuitePage>
  );
};

const FeedbackTab: React.FC = () => {
  const { state, party, logFeedback } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [f, setF] = useState({ customerId: '', type: 'COMPLAINT' as Feedback['type'], channel: 'PHONE' as Feedback['channel'], category: 'Delivery', severity: 'MEDIUM' as Feedback['severity'], subject: '' });
  const cols: Column<Feedback>[] = [
    { key: 'n', header: 'Ref', render: (x) => <b className="sx-mono">{x.number}</b>, sort: (x) => x.number },
    {
      key: 's',
      header: 'Subject',
      render: (x) => (
        <div className="sx-cell-main">
          <span>{x.subject}</span>
          <small>
            {party(x.customerId)?.name} · {x.type.toLowerCase()} · {x.channel.toLowerCase()}
          </small>
        </div>
      )
    },
    { key: 'o', header: 'Owner', render: (x) => x.owner, sort: (x) => x.owner },
    { key: 'd', header: 'Due', render: (x) => <span className={feedbackLate(x) ? 'sx-danger-text' : ''}>{fmtDate(x.slaDue)}</span>, sort: (x) => x.slaDue },
    { key: 'v', header: 'Severity', render: (x) => x.severity.toLowerCase() },
    { key: 'st', header: 'Status', render: (x) => <Pill status={x.status === 'CLOSED' ? 'POSTED' : x.status === 'RESOLVED' ? 'APPROVED' : 'SUBMITTED'} label={x.status.toLowerCase().replace('_', ' ')} />, sort: (x) => x.status }
  ];
  const current = state.feedback.find((x) => x.id === openId);
  return (
    <>
      <Panel title="Log feedback" subtitle="From a call, email, visit or survey">
        <div className="tr-row">
          <div className="grow">
            <PartySelect kind="CUSTOMER" value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} />
          </div>
          <select className="form-control" aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Feedback['type'] })}>
            <option value="COMPLAINT">Complaint</option>
            <option value="COMPLIMENT">Compliment</option>
            <option value="SUGGESTION">Suggestion</option>
          </select>
          <select className="form-control" aria-label="Channel" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as Feedback['channel'] })}>
            {['PHONE', 'EMAIL', 'VISIT', 'SURVEY'].map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
          <select className="form-control" aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {['Delivery', 'Quality', 'Pricing', 'Invoice', 'Service'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="form-control" aria-label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Feedback['severity'] })}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          <input className="form-control grow" placeholder="What did the customer say?" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => logFeedback(f).ok && setF({ ...f, subject: '' })}>
            <Plus size={13} /> Log
          </button>
        </div>
      </Panel>
      <DataTable rows={state.feedback} columns={cols} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} initialSort={{ key: 'd', dir: 'asc' }} />
      {current && <FeedbackDrawer f={current} onClose={() => setOpenId(null)} />}
    </>
  );
};

const FeedbackDrawer: React.FC<{ f: Feedback; onClose: () => void }> = ({ f, onClose }) => {
  const { state, party, assignFeedback, progressFeedback, closeFeedback } = useCommercial();
  const [owner, setOwner] = useState(f.owner);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(4);
  return (
    <Drawer title={f.number} subtitle={`${party(f.customerId)?.name} · ${f.category}`} badge={<Pill status={f.status === 'CLOSED' ? 'POSTED' : 'SUBMITTED'} label={f.status.toLowerCase().replace('_', ' ')} />} onClose={onClose}>
      <DefList
        items={[
          ['Subject', f.subject],
          ['Type', f.type.toLowerCase()],
          ['Severity', `${f.severity.toLowerCase()} — respond within ${SLA_DAYS[f.severity]} days`],
          ['Due', `${fmtDate(f.slaDue)}${feedbackLate(f) ? ' (late)' : ''}`],
          ['Order', state.orders.find((o) => o.id === f.orderId)?.number ?? '—'],
          ['Resolution', f.resolution ?? '—'],
          ['Customer rating', f.rating ? `${f.rating}/5` : '—']
        ]}
      />
      {f.status !== 'CLOSED' && (
        <>
          <div className="tr-row">
            <select className="form-control" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {OWNERS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => assignFeedback(f.id, owner)}>
              Assign
            </button>
          </div>
          {f.status !== 'RESOLVED' ? (
            <div className="tr-row">
              <input className="form-control grow" placeholder="Action taken / resolution" value={text} onChange={(e) => setText(e.target.value)} />
              {f.status === 'OPEN' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => progressFeedback(f.id, 'IN_PROGRESS', text)}>
                  Start
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => progressFeedback(f.id, 'RESOLVED', text)}>
                Resolve
              </button>
            </div>
          ) : (
            <div className="tr-row">
              <Field label="Customer satisfaction (1–5)">
                <input className="form-control" type="number" min="1" max="5" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
              </Field>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => closeFeedback(f.id, rating)}>
                Close
              </button>
            </div>
          )}
        </>
      )}
      <h4 className="sx-subhead">History</h4>
      <ul className="sx-list">
        {[...f.history].reverse().map((h, i) => (
          <li key={i}>
            <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
            <span>{h.action}</span>
            <span className="sx-muted">{h.note}</span>
            <b>{h.by}</b>
          </li>
        ))}
      </ul>
    </Drawer>
  );
};

const Surveys: React.FC = () => {
  const { state, party, recordSurvey } = useCommercial();
  const [r, setR] = useState({ customerId: '', date: TODAY, nps: 8, csat: 4, comment: '' });
  const byCustomer = [...new Set(state.surveys.map((s) => s.customerId))].map((c) => {
    const list = state.surveys.filter((s) => s.customerId === c);
    return { c, nps: npsOf(list.map((s) => s.nps)), csat: round2(list.reduce((x, s) => x + s.csat, 0) / list.length), n: list.length };
  });
  return (
    <>
      <Panel title="Record a survey response" subtitle="Likelihood to recommend (0–10) and satisfaction (1–5)">
        <div className="tr-row">
          <div className="grow">
            <PartySelect kind="CUSTOMER" value={r.customerId} onChange={(v) => setR({ ...r, customerId: v })} />
          </div>
          <input className="form-control" type="number" min="0" max="10" aria-label="NPS" value={r.nps} onChange={(e) => setR({ ...r, nps: Number(e.target.value) })} />
          <input className="form-control" type="number" min="1" max="5" aria-label="CSAT" value={r.csat} onChange={(e) => setR({ ...r, csat: Number(e.target.value) })} />
          <input className="form-control grow" placeholder="Comment" value={r.comment} onChange={(e) => setR({ ...r, comment: e.target.value })} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => recordSurvey(r).ok && setR({ ...r, comment: '' })}>
            Save
          </button>
        </div>
      </Panel>
      <Panel title="By customer">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Responses</th>
              <th>NPS</th>
              <th>CSAT</th>
            </tr>
          </thead>
          <tbody>
            {byCustomer.map((x) => (
              <tr key={x.c}>
                <td>{party(x.c)?.name}</td>
                <td>{x.n}</td>
                <td>{x.nps}</td>
                <td>{x.csat}/5</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
};

const Visits: React.FC = () => {
  const { state, party, logVisit, completeVisit } = useCommercial();
  const [v, setV] = useState({ customerId: '', subject: '', due: addDays(TODAY, 3), type: 'VISIT' as 'VISIT' | 'CALL' | 'MEETING' | 'EMAIL' });
  const [rep, setRep] = useState<Record<string, { report: string; score: number }>>({});
  const list = state.activities.filter((a) => a.customerId && !a.opportunityId);
  return (
    <>
      <Panel title="Plan a customer follow-up" subtitle="Buyer visits need a report and an experience score (1–5) to complete">
        <div className="tr-row">
          <div className="grow">
            <PartySelect kind="CUSTOMER" value={v.customerId} onChange={(x) => setV({ ...v, customerId: x })} />
          </div>
          <select className="form-control" aria-label="Type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>
            <option value="VISIT">Visit</option>
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
            <option value="EMAIL">Email</option>
          </select>
          <input className="form-control grow" placeholder="Purpose" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
          <input className="form-control" type="date" aria-label="Due" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => logVisit(v.customerId, v.subject, v.due, v.type).ok && setV({ ...v, subject: '' })}>
            <MapPin size={13} /> Plan
          </button>
        </div>
      </Panel>
      <Panel title="Follow-ups">
        <ul className="sx-list">
          {list.map((a) => (
            <li key={a.id} style={{ flexWrap: 'wrap' }}>
              <span>{fmtDate(a.due)}</span>
              <b>{a.subject}</b>
              <span>{party(a.customerId!)?.name}</span>
              <span className="sx-muted">
                {a.type.toLowerCase()} · {a.owner}
              </span>
              {a.done ? (
                <span>
                  {a.visitReport ?? a.outcome} {a.visitScore ? `· ${a.visitScore}/5` : ''}
                </span>
              ) : (
                <span className="tr-row">
                  <input className="form-control" placeholder="Report" value={rep[a.id]?.report ?? ''} onChange={(e) => setRep({ ...rep, [a.id]: { score: rep[a.id]?.score ?? 4, report: e.target.value } })} />
                  <input className="form-control" type="number" min="1" max="5" aria-label="Score" style={{ maxWidth: 70 }} value={rep[a.id]?.score ?? 4} onChange={(e) => setRep({ ...rep, [a.id]: { report: rep[a.id]?.report ?? '', score: Number(e.target.value) } })} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => completeVisit(a.id, rep[a.id]?.report ?? '', rep[a.id]?.score ?? 0)}>
                    Complete
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
};

const Journey: React.FC = () => {
  const { state, finance } = useCommercial();
  const customers = finance.state.parties.filter((p) => p.kind === 'CUSTOMER' && p.category !== 'Cash sales');
  return (
    <Panel title="Customer journey" subtitle={`From first contact to repeat business and feedback: ${JOURNEY.join(' › ')}`}>
      {customers.map((c) => {
        const j = journeyOf(state, finance.state, c.id);
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <b>{c.name}</b>
            <div className="tr-journey">
              {j.map((s) => (
                <span key={s.stage} className={s.date ? 'done' : ''}>
                  {s.stage}
                  <small>{s.date ? fmtDate(s.date) : '—'}</small>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </Panel>
  );
};
