import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Check, X } from 'lucide-react';

export interface CreatableOption {
  value: string;
  label: string;
  hint?: string;
}

interface CreatableSelectProps {
  label: string;
  value: string;
  options: CreatableOption[];
  onChange: (value: string) => void;
  /** Called with what the user typed when they choose "Add …". */
  onCreateRequest?: (query: string) => void;
  entityName: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  invalid?: boolean;
  allowClear?: boolean;
}

/** Searchable dropdown that lets users add a missing entry without leaving the form. */
export const CreatableSelect: React.FC<CreatableSelectProps> = ({
  label,
  value,
  options,
  onChange,
  onCreateRequest,
  entityName,
  placeholder,
  required,
  disabled,
  disabledHint,
  invalid,
  allowClear
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const showCreate = !!onCreateRequest && !exact;
  const rows = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => setActive(0), [query, open]);

  const choose = (i: number) => {
    if (i < filtered.length) {
      onChange(filtered[i].value);
    } else if (showCreate) {
      onCreateRequest!(query.trim());
    }
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(rows - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      if (open && rows > 0) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className={`cs-field req-field ${disabled ? 'is-disabled' : ''}`} ref={wrapRef}>
      <span>
        {label}
        {required && <em className="cs-req"> *</em>}
      </span>
      <div className={`cs-control ${open ? 'open' : ''} ${invalid ? 'invalid' : ''}`}>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          className="cs-input"
          disabled={disabled}
          placeholder={disabled ? disabledHint ?? placeholder : selected ? selected.label : placeholder ?? `Select ${entityName}…`}
          value={open ? query : selected?.label ?? ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
        />
        {allowClear && value && !disabled && (
          <button type="button" className="cs-clear" aria-label={`Clear ${label}`} onClick={() => onChange('')}>
            <X size={13} />
          </button>
        )}
        <ChevronDown size={15} className="cs-caret" aria-hidden="true" />
      </div>

      {open && !disabled && (
        <ul className="cs-list" role="listbox" id={listId}>
          {filtered.length === 0 && !showCreate && <li className="cs-empty">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`cs-option ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
            >
              <span className="cs-option-text">
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {o.value === value && <Check size={14} />}
            </li>
          ))}
          {showCreate && (
            <li
              role="option"
              aria-selected={false}
              className={`cs-option cs-create ${active === filtered.length ? 'active' : ''}`}
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(filtered.length);
              }}
            >
              <Plus size={14} />
              {query.trim() ? (
                <span>
                  Add {entityName} “<b>{query.trim()}</b>”
                </span>
              ) : (
                <span>Add new {entityName}</span>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
