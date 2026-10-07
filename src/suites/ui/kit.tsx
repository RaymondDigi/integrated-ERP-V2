import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

export const SuitePage: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions, children }) => (
  <div className="sx-page">
    <header className="sx-page-head">
      <div>
        <span className="sx-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="sx-page-actions">{actions}</div>}
    </header>
    {children}
  </div>
);

export type Tone = 'green' | 'gold' | 'blue' | 'violet' | 'orange' | 'red' | 'slate';

export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: React.ReactNode;
  tone?: Tone;
  onClick?: () => void;
}> = ({ label, value, detail, icon, tone = 'green', onClick }) => {
  const body = (
    <>
      <div className="sx-stat-top">
        <span className={`sx-tone sx-tone-${tone}`}>{icon}</span>
        <span className="sx-stat-label">{label}</span>
        {onClick && <ArrowUpRight size={15} className="sx-stat-go" />}
      </div>
      <div className="sx-stat-value">{value}</div>
      {detail && <div className="sx-stat-detail">{detail}</div>}
    </>
  );
  return onClick ? (
    <button type="button" className="sx-stat sx-stat-link" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="sx-stat">{body}</div>
  );
};

export const Panel: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  flush?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, action, className = '', flush, children }) => (
  <section className={`sx-panel ${className}`}>
    <div className="sx-panel-head">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className={flush ? 'sx-panel-flush' : 'sx-panel-body'}>{children}</div>
  </section>
);

export const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" className="sx-link" onClick={onClick}>
    {children} <ChevronRight size={14} />
  </button>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="sx-empty">
    {icon && <span className="sx-empty-icon">{icon}</span>}
    <strong>{title}</strong>
    {text && <p>{text}</p>}
    {action}
  </div>
);

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

const PILL: Record<string, { tone: string; label: string }> = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SUBMITTED: { tone: 'warning', label: 'Awaiting approval' },
  APPROVED: { tone: 'info', label: 'Approved' },
  POSTED: { tone: 'success', label: 'Posted' },
  REJECTED: { tone: 'critical', label: 'Rejected' },
  VOID: { tone: 'neutral', label: 'Void' },
  UNPAID: { tone: 'neutral', label: 'Unpaid' },
  PART_PAID: { tone: 'info', label: 'Part paid' },
  PAID: { tone: 'success', label: 'Paid' },
  OVERDUE: { tone: 'critical', label: 'Overdue' },
  OPEN: { tone: 'info', label: 'Open' },
  CLOSED: { tone: 'neutral', label: 'Closed' },
  MATCHED: { tone: 'success', label: 'Matched' },
  UNMATCHED: { tone: 'warning', label: 'Unmatched' },
  ACTIVE: { tone: 'success', label: 'Active' },
  DISPOSED: { tone: 'neutral', label: 'Disposed' }
};

export const Pill: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const p = PILL[status] ?? { tone: 'neutral', label: status };
  return (
    <span className={`sx-pill sx-pill-${p.tone}`}>
      <i />
      {label ?? p.label}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Filters and search                                                  */
/* ------------------------------------------------------------------ */

export const Chips = <T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) => (
  <div className="sx-chips" role="tablist">
    {options.map((o) => (
      <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
        {o.label}
        {o.count !== undefined && <em>{o.count}</em>}
      </button>
    ))}
  </div>
);

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = 'Search…' }) => (
  <label className="sx-search">
    <Search size={14} />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search">
        <X size={13} />
      </button>
    )}
  </label>
);

/* ------------------------------------------------------------------ */
/* Data table                                                          */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  hideOnMobile?: boolean;
}

export const DataTable = <T,>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty = 'Nothing to show',
  pageSize = 12,
  footer,
  initialSort,
  selected
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  pageSize?: number;
  footer?: React.ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  selected?: string | null;
}) => {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [pages, page]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="sx-table-wrap">
      <div className="sx-table-scroll">
        <table className="sx-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width, textAlign: c.align }} className={c.hideOnMobile ? 'sx-hide-sm' : ''}>
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      className={sort?.key === c.key ? 'sorted' : ''}
                    >
                      {c.header}
                      <ChevronsUpDown size={12} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const key = rowKey(r);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`${onRowClick ? 'clickable' : ''} ${selected === key ? 'selected' : ''}`}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align }} className={c.hideOnMobile ? 'sx-hide-sm' : ''}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
        {rows.length === 0 && <div className="sx-table-empty">{empty}</div>}
      </div>
      {sorted.length > pageSize && (
        <div className="sx-pager">
          <span>
            {page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}
          </span>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

const useEscape = (onClose: () => void) => {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', fn, true);
    return () => window.removeEventListener('keydown', fn, true);
  }, [onClose]);
};

export const Drawer: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, badge, onClose, footer, wide, children }) => {
  useEscape(onClose);
  return (
    <div className="sx-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`sx-drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header className="sx-drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {badge}
          <button type="button" className="sx-icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </header>
        <div className="sx-drawer-body">{children}</div>
        {footer && <footer className="sx-drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
};

export const Modal: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, footer, size = 'lg', children }) => {
  useEscape(onClose);
  return (
    <div className="sx-overlay sx-overlay-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sx-modal sx-modal-${size}`} role="dialog" aria-modal="true">
        <header className="sx-drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="sx-icon-btn" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </header>
        <div className="sx-modal-body">{children}</div>
        {footer && <footer className="sx-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Workflow                                                            */
/* ------------------------------------------------------------------ */

const STEPS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED'] as const;
const STEP_LABEL = { DRAFT: 'Prepared', SUBMITTED: 'Submitted', APPROVED: 'Approved', POSTED: 'Posted' };

export const Stepper: React.FC<{ status: string; approvals?: { done: number; needed: number } }> = ({ status, approvals }) => {
  const off = status === 'REJECTED' || status === 'VOID';
  const at = off ? 0 : STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol className={`sx-stepper ${off ? 'off' : ''}`}>
      {STEPS.map((s, i) => {
        const state = i < at || status === 'POSTED' ? 'done' : i === at ? 'current' : 'todo';
        return (
          <li key={s} className={state}>
            <span>{state === 'done' ? <Check size={12} /> : i + 1}</span>
            <b>{STEP_LABEL[s]}</b>
            {s === 'APPROVED' && approvals && approvals.needed > 1 && (
              <small>
                {Math.min(approvals.done, approvals.needed)}/{approvals.needed} approvals
              </small>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export const Timeline: React.FC<{ items: { at: string; by: string; action: string; note?: string }[] }> = ({ items }) => (
  <ul className="sx-timeline">
    {[...items].reverse().map((h, i) => (
      <li key={i}>
        <i />
        <div>
          <p>
            <b>{h.action}</b> · {h.by}
          </p>
          {h.note && <q>{h.note}</q>}
          <small>
            {new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </small>
        </div>
      </li>
    ))}
  </ul>
);

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export const Field: React.FC<{ label: string; required?: boolean; hint?: React.ReactNode; span?: 1 | 2 | 3 | 4; children: React.ReactNode }> = ({
  label,
  required,
  hint,
  span = 1,
  children
}) => (
  <label className={`req-field sx-span-${span}`}>
    <span>
      {label}
      {required && <em className="cs-req"> *</em>}
    </span>
    {children}
    {hint && <small className="ew-hint">{hint}</small>}
  </label>
);

export const DefList: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <dl className="sx-deflist">
    {items.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
);

/* ------------------------------------------------------------------ */
/* Charts (dependency-free SVG)                                        */
/* ------------------------------------------------------------------ */

export const Bars: React.FC<{
  data: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
  height?: number;
  format?: (n: number) => string;
}> = ({ data, series, height = 220, format = (n) => n.toLocaleString() }) => {
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <div className="sx-bars" style={{ height }}>
      <div className="sx-bars-grid">
        {ticks.reverse().map((t) => (
          <div key={t}>
            <span>{format(t)}</span>
          </div>
        ))}
      </div>
      <div className="sx-bars-cols">
        {data.map((d) => (
          <div key={d.label} className="sx-bars-col">
            <div className="sx-bars-stack">
              {d.values.map((v, i) => (
                <i
                  key={i}
                  style={{ height: `${(v / max) * 100}%`, background: series[i].color }}
                  title={`${d.label} · ${series[i].name}: ${format(v)}`}
                />
              ))}
            </div>
            <span>{d.label}</span>
          </div>
        ))}
      </div>
      <div className="sx-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
};

export const Donut: React.FC<{ items: { label: string; value: number; color: string }[]; center: React.ReactNode; caption?: string }> = ({ items, center, caption }) => {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="sx-donut">
      <div className="sx-donut-chart">
        <svg viewBox="0 0 100 100" role="img">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-subtle)" strokeWidth="11" />
          {items.map((it) => {
            const len = (it.value / total) * c;
            const el = (
              <circle
                key={it.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={it.color}
                strokeWidth="11"
                strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 50 50)"
              >
                <title>{it.label}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="sx-donut-center">
          <strong>{center}</strong>
          {caption && <span>{caption}</span>}
        </div>
      </div>
      <ul className="sx-donut-legend">
        {items.map((it) => (
          <li key={it.label}>
            <i style={{ background: it.color }} />
            <span>{it.label}</span>
            <b>{Math.round((it.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const Meter: React.FC<{ value: number; tone?: 'green' | 'gold' | 'red' }> = ({ value, tone = 'green' }) => (
  <span className={`sx-meter sx-meter-${tone}`}>
    <i style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
  </span>
);

/* ------------------------------------------------------------------ */
/* Generic flow steps and approval panel (used by every suite)         */
/* ------------------------------------------------------------------ */

export const FlowSteps: React.FC<{ steps: string[]; at: number; off?: boolean; note?: Record<number, string> }> = ({ steps, at, off, note }) => (
  <ol className={`sx-stepper ${off ? 'off' : ''}`} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((s, i) => {
      const state = i < at ? 'done' : i === at ? 'current' : 'todo';
      return (
        <li key={s} className={state}>
          <span>{state === 'done' ? <Check size={12} /> : i + 1}</span>
          <b>{s}</b>
          {note?.[i] && <small>{note[i]}</small>}
        </li>
      );
    })}
  </ol>
);

export interface FlowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
}

export const ApprovalPanel: React.FC<{
  steps: React.ReactNode;
  actions: FlowAction[];
  canReject?: boolean;
  onReject?: (note: string) => boolean;
  notes?: React.ReactNode[];
  actorLine: React.ReactNode;
  history: { at: string; by: string; action: string; note?: string }[];
}> = ({ steps, actions, canReject, onReject, notes = [], actorLine, history }) => {
  const [rejecting, setRejecting] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="sx-workflow">
      {steps}
      {notes.filter(Boolean).map((n, i) => (
        <div key={i} className="sx-note">
          {n}
        </div>
      ))}
      {rejecting ? (
        <div className="sx-reject">
          <textarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs to change?" autoFocus />
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (onReject?.(text)) {
                  setRejecting(false);
                  setText('');
                }
              }}
            >
              Return to preparer
            </button>
          </div>
        </div>
      ) : (
        (actions.length > 0 || canReject) && (
          <div className="sx-actions">
            {actions.map((a) => (
              <button key={a.label} type="button" className={`btn btn-${a.tone ?? 'primary'} btn-sm`} onClick={a.onClick} disabled={a.disabled} title={a.title}>
                {a.icon} {a.label}
              </button>
            ))}
            {canReject && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(true)}>
                Reject
              </button>
            )}
          </div>
        )
      )}
      <div className="sx-acting">{actorLine}</div>
      <h4 className="sx-subhead">History</h4>
      <Timeline items={history} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Role-aware to-do list used on every overview                        */
/* ------------------------------------------------------------------ */

export interface TodoItem {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}

export const TodoList: React.FC<{ items: TodoItem[]; max?: number }> = ({ items, max = 8 }) =>
  items.length === 0 ? (
    <div className="sx-allclear">
      <Check size={24} />
      <p>All caught up.</p>
    </div>
  ) : (
    <ul className="sx-todo">
      {items.slice(0, max).map((i) => (
        <li key={i.id}>
          <button type="button" onClick={i.onClick}>
            <span className={`sx-todo-icon ${i.tone}`}>{i.icon}</span>
            <span className="sx-todo-text">
              <b>{i.title}</b>
              <small>{i.detail}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </li>
      ))}
    </ul>
  );

/** Overview header shared by every suite. */
export const Hero: React.FC<{ eyebrow: string; title: string; text: React.ReactNode; actions?: { label: string; icon: React.ReactNode; onClick: () => void }[] }> = ({ eyebrow, title, text, actions = [] }) => (
  <header className="sx-hero">
    <div>
      <span className="sx-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
    {actions.length > 0 && (
      <div className="sx-quick">
        {actions.map((a) => (
          <button key={a.label} type="button" onClick={a.onClick}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    )}
  </header>
);

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
