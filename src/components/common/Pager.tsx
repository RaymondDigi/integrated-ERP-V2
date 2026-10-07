import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface Paged<T> {
  rows: T[];
  page: number;
  pages: number;
  size: number;
  total: number;
  from: number;
  to: number;
  setPage: (p: number) => void;
  setSize: (s: number) => void;
}

/**
 * Splits a list into pages. Goes back to page 1 whenever `resetKey` changes (filters, search, period)
 * and never leaves the page past the end when the list shrinks.
 */
export const usePaged = <T,>(list: T[], initialSize = 25, resetKey?: unknown): Paged<T> => {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState(initialSize);
  useEffect(() => setPage(1), [resetKey]);
  const total = list.length;
  const pages = size >= total || size === 0 ? 1 : Math.ceil(total / size);
  const current = Math.min(page, pages);
  const rows = useMemo(() => (size === 0 ? list : list.slice((current - 1) * size, current * size)), [list, current, size]);
  return {
    rows,
    page: current,
    pages,
    size,
    total,
    from: total ? (size === 0 ? 1 : (current - 1) * size + 1) : 0,
    to: size === 0 ? total : Math.min(total, current * size),
    setPage: (p) => setPage(Math.max(1, Math.min(pages, p))),
    setSize: (s) => {
      setSizeState(s);
      setPage(1);
    }
  };
};

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
const pageList = (page: number, pages: number) => {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
};

export const Pager: React.FC<{ p: Paged<unknown>; noun?: string; sizes?: number[] }> = ({ p, noun = 'rows', sizes = [10, 25, 50, 100] }) => {
  if (p.total <= Math.min(...sizes)) return null;
  return (
    <div className="pg-bar" role="navigation" aria-label="Pagination">
      <span className="pg-count">
        {p.from}–{p.to} of {p.total} {noun}
      </span>
      <label className="pg-size">
        <span>Show</span>
        <select value={p.size} onChange={(ev) => p.setSize(Number(ev.target.value))} aria-label="Rows per page">
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value={0}>All</option>
        </select>
      </label>
      {p.pages > 1 && (
        <div className="pg-pages">
          <button onClick={() => p.setPage(p.page - 1)} disabled={p.page === 1} aria-label="Previous page">
            <ChevronLeft size={14} />
          </button>
          {pageList(p.page, p.pages).map((x, i) =>
            x === '…' ? (
              <span key={`g${i}`} className="pg-gap">
                …
              </span>
            ) : (
              <button key={x} className={x === p.page ? 'active' : ''} onClick={() => p.setPage(x)} aria-current={x === p.page ? 'page' : undefined}>
                {x}
              </button>
            )
          )}
          <button onClick={() => p.setPage(p.page + 1)} disabled={p.page === p.pages} aria-label="Next page">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
