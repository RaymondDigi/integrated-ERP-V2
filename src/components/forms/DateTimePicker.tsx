import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarRange
} from 'lucide-react';

/* Helper Date Formatting */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const formatDateYMD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDateHuman = (date: Date): string => {
  const m = MONTH_NAMES[date.getMonth()].slice(0, 3);
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m} ${d}, ${y}`;
};

/* ==========================================================================
   1. Single Date Picker with Calendar Dropdown
   ========================================================================== */
export interface DatePickerDropdownProps {
  label?: string;
  value?: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
  helperText?: string;
  minDate?: string;
  maxDate?: string;
}

export const DatePickerDropdown: React.FC<DatePickerDropdownProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Select date...',
  helperText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const today = new Date();

  // Calendar View month & year
  const [viewYear, setViewYear] = useState(selectedDate ? selectedDate.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate ? selectedDate.getMonth() : today.getMonth());

  // Close on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(formatDateYMD(d));
    setIsOpen(false);
  };

  const setPresetDate = (daysFromNow: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysFromNow);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    onChange(formatDateYMD(target));
    setIsOpen(false);
  };

  // Build month matrix
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  return (
    <div className="form-group" ref={containerRef}>
      {label && <label className="form-label">{label}</label>}

      <div className="datepicker-wrapper">
        <div
          className={`datepicker-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="datepicker-trigger-left">
            <CalendarIcon size={15} color="var(--brand-primary)" />
            {selectedDate ? (
              <span style={{ fontWeight: 600 }}>{formatDateHuman(selectedDate)}</span>
            ) : (
              <span className="datepicker-trigger-placeholder">{placeholder}</span>
            )}
          </div>

          <div className="datepicker-trigger-right">
            {value && (
              <button
                type="button"
                className="input-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                title="Clear date"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="datepicker-popover">
            {/* Quick Presets Bar */}
            <div className="calendar-presets-container">
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setPresetDate(0)}
              >
                Today
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setPresetDate(1)}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setPresetDate(7)}
              >
                +7 Days
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setPresetDate(30)}
              >
                +30 Days
              </button>
            </div>

            {/* Calendar Month/Year Header */}
            <div className="calendar-header">
              <button type="button" className="calendar-nav-btn" onClick={handlePrevMonth}>
                <ChevronLeft size={14} />
              </button>

              <div className="calendar-month-year">
                <span>{MONTH_NAMES[viewMonth]}</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{viewYear}</span>
              </div>

              <button type="button" className="calendar-nav-btn" onClick={handleNextMonth}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Weekdays Row */}
            <div className="calendar-weekdays-row">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="calendar-weekday-cell">
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="calendar-days-grid">
              {/* Prev Month Days */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => {
                const dayNum = daysInPrevMonth - firstDayOfWeek + idx + 1;
                return (
                  <div key={`prev-${idx}`} className="calendar-day-cell outside-month">
                    {dayNum}
                  </div>
                );
              })}

              {/* Current Month Days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateObj = new Date(viewYear, viewMonth, dayNum);
                const isSelected = selectedDate ? formatDateYMD(selectedDate) === formatDateYMD(dateObj) : false;
                const isToday = formatDateYMD(today) === formatDateYMD(dateObj);

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    className={`calendar-day-cell ${isSelected ? 'selected' : ''} ${
                      isToday && !isSelected ? 'today' : ''
                    }`}
                    onClick={() => handleSelectDay(dayNum)}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="datepicker-footer">
              <span className="datepicker-footer-preview">
                {selectedDate ? formatDateYMD(selectedDate) : 'No date selected'}
              </span>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   2. Date Range Picker Dropdown (Start & End with Presets)
   ========================================================================== */
export interface DateRangePickerProps {
  label?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  onChange: (start: string, end: string) => void;
  helperText?: string;
}

export const DateRangePickerDropdown: React.FC<DateRangePickerProps> = ({
  label,
  startDate,
  endDate,
  onChange,
  helperText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startObj = startDate ? new Date(startDate + 'T00:00:00') : null;
  const today = new Date();

  const [viewYear, setViewYear] = useState(startObj ? startObj.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(startObj ? startObj.getMonth() : today.getMonth());
  const [tempStart, setTempStart] = useState<string | null>(startDate || null);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate || null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleSelectDay = (day: number) => {
    const selected = formatDateYMD(new Date(viewYear, viewMonth, day));
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(selected);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      if (new Date(selected) < new Date(tempStart)) {
        setTempEnd(tempStart);
        setTempStart(selected);
      } else {
        setTempEnd(selected);
      }
    }
  };

  const applyRange = () => {
    if (tempStart && tempEnd) {
      onChange(tempStart, tempEnd);
    } else if (tempStart) {
      onChange(tempStart, tempStart);
    }
    setIsOpen(false);
  };

  const setQuickRange = (preset: 'today' | '7d' | '30d' | 'quarter') => {
    const now = new Date();
    const end = formatDateYMD(now);
    let start = end;

    if (preset === '7d') {
      const s = new Date();
      s.setDate(s.getDate() - 7);
      start = formatDateYMD(s);
    } else if (preset === '30d') {
      const s = new Date();
      s.setDate(s.getDate() - 30);
      start = formatDateYMD(s);
    } else if (preset === 'quarter') {
      const s = new Date();
      s.setDate(s.getDate() - 90);
      start = formatDateYMD(s);
    }

    setTempStart(start);
    setTempEnd(end);
    onChange(start, end);
    setIsOpen(false);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  return (
    <div className="form-group" ref={containerRef}>
      {label && <label className="form-label">{label}</label>}

      <div className="datepicker-wrapper">
        <div
          className={`datepicker-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="datepicker-trigger-left">
            <CalendarRange size={15} color="var(--brand-primary)" />
            {startDate && endDate ? (
              <span style={{ fontWeight: 600 }}>
                {formatDateHuman(new Date(startDate + 'T00:00:00'))} — {formatDateHuman(new Date(endDate + 'T00:00:00'))}
              </span>
            ) : (
              <span className="datepicker-trigger-placeholder">Select date range...</span>
            )}
          </div>

          <div className="datepicker-trigger-right">
            {startDate && (
              <button
                type="button"
                className="input-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('', '');
                  setTempStart(null);
                  setTempEnd(null);
                }}
                title="Clear range"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="datepicker-popover range-popover">
            {/* Presets */}
            <div className="calendar-presets-container">
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setQuickRange('today')}
              >
                Today
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setQuickRange('7d')}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setQuickRange('30d')}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                className="calendar-preset-chip"
                onClick={() => setQuickRange('quarter')}
              >
                Last Quarter
              </button>
            </div>

            {/* Header */}
            <div className="calendar-header">
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                }}
              >
                <ChevronLeft size={14} />
              </button>

              <div className="calendar-month-year">
                <span>{MONTH_NAMES[viewMonth]}</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{viewYear}</span>
              </div>

              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Weekdays */}
            <div className="calendar-weekdays-row">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="calendar-weekday-cell">
                  {w}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="calendar-days-grid">
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`prev-${idx}`} className="calendar-day-cell outside-month" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const currentYMD = formatDateYMD(new Date(viewYear, viewMonth, dayNum));
                const isStart = tempStart === currentYMD;
                const isEnd = tempEnd === currentYMD;
                const inRange =
                  tempStart && tempEnd && currentYMD > tempStart && currentYMD < tempEnd;
                const isHoverRange =
                  tempStart && !tempEnd && hoverDate && currentYMD > tempStart && currentYMD <= hoverDate;

                return (
                  <button
                    key={`day-${dayNum}`}
                    type="button"
                    className={`calendar-day-cell ${isStart ? 'range-start' : ''} ${
                      isEnd ? 'range-end' : ''
                    } ${inRange || isHoverRange ? 'range-mid' : ''}`}
                    onClick={() => handleSelectDay(dayNum)}
                    onMouseEnter={() => setHoverDate(currentYMD)}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="datepicker-footer">
              <span className="datepicker-footer-preview" style={{ fontSize: 10 }}>
                {tempStart ? tempStart : 'Start'} → {tempEnd ? tempEnd : 'End'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  disabled={!tempStart}
                  onClick={applyRange}
                >
                  Apply Range
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   3. Time Picker Dropdown (Hours, Minutes, AM/PM & Quick Chips)
   ========================================================================== */
export interface TimePickerDropdownProps {
  label?: string;
  value: string; // e.g. "14:30" or "09:00 AM"
  onChange: (val: string) => void;
  helperText?: string;
}

export const TimePickerDropdown: React.FC<TimePickerDropdownProps> = ({
  label,
  value,
  onChange,
  helperText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse time
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('30');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const selectPreset = (h: string, m: string, p: 'AM' | 'PM') => {
    setHour(h);
    setMinute(m);
    setPeriod(p);
    onChange(`${h}:${m} ${p}`);
    setIsOpen(false);
  };

  const handleApply = () => {
    onChange(`${hour}:${minute} ${period}`);
    setIsOpen(false);
  };

  const hoursList = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  return (
    <div className="form-group" ref={containerRef}>
      {label && <label className="form-label">{label}</label>}

      <div className="datepicker-wrapper">
        <div
          className={`datepicker-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="datepicker-trigger-left">
            <Clock size={15} color="var(--status-approval)" />
            <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              {value || `${hour}:${minute} ${period}`}
            </span>
          </div>

          <div className="datepicker-trigger-right">
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>UTC-4</span>
          </div>
        </div>

        {isOpen && (
          <div className="timepicker-popover">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                Select Time
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {hour}:{minute} {period}
              </span>
            </div>

            <div className="timepicker-columns">
              {/* Hours Column */}
              <div className="timepicker-col">
                <span className="timepicker-col-title">Hour</span>
                {hoursList.map((h) => (
                  <div
                    key={h}
                    className={`timepicker-item ${hour === h ? 'active' : ''}`}
                    onClick={() => setHour(h)}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Minutes Column */}
              <div className="timepicker-col">
                <span className="timepicker-col-title">Min</span>
                {minutesList.map((m) => (
                  <div
                    key={m}
                    className={`timepicker-item ${minute === m ? 'active' : ''}`}
                    onClick={() => setMinute(m)}
                  >
                    {m}
                  </div>
                ))}
              </div>

              {/* Period Column */}
              <div className="timepicker-col" style={{ flex: 0.8 }}>
                <span className="timepicker-col-title">AM/PM</span>
                <div
                  className={`timepicker-item ${period === 'AM' ? 'active' : ''}`}
                  onClick={() => setPeriod('AM')}
                >
                  AM
                </div>
                <div
                  className={`timepicker-item ${period === 'PM' ? 'active' : ''}`}
                  onClick={() => setPeriod('PM')}
                >
                  PM
                </div>
              </div>
            </div>

            {/* Quick Chips */}
            <div className="timepicker-chips">
              <span className="timepicker-chip" onClick={() => selectPreset('00', '00', 'AM')}>
                00:00 Midnight
              </span>
              <span className="timepicker-chip" onClick={() => selectPreset('08', '00', 'AM')}>
                08:00 AM
              </span>
              <span className="timepicker-chip" onClick={() => selectPreset('12', '00', 'PM')}>
                12:00 Noon
              </span>
              <span className="timepicker-chip" onClick={() => selectPreset('05', '00', 'PM')}>
                05:00 PM
              </span>
              <span className="timepicker-chip" onClick={() => selectPreset('11', '59', 'PM')}>
                11:59 PM
              </span>
            </div>

            {/* Footer */}
            <div className="datepicker-footer">
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={handleApply}
              >
                Apply Time
              </button>
            </div>
          </div>
        )}
      </div>

      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   4. Unified DateTime Picker Dropdown
   ========================================================================== */
export interface DateTimePickerDropdownProps {
  label?: string;
  dateValue: string; // YYYY-MM-DD
  timeValue: string; // HH:MM AM/PM
  onChange: (date: string, time: string) => void;
  helperText?: string;
}

export const DateTimePickerDropdown: React.FC<DateTimePickerDropdownProps> = ({
  label,
  dateValue,
  timeValue,
  onChange,
  helperText
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tempDate, setTempDate] = useState(dateValue || formatDateYMD(new Date()));
  const [tempTime, setTempTime] = useState(timeValue || '09:00 AM');

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const applyDateTime = () => {
    onChange(tempDate, tempTime);
    setIsOpen(false);
  };

  return (
    <div className="form-group" ref={containerRef}>
      {label && <label className="form-label">{label}</label>}

      <div className="datepicker-wrapper">
        <div
          className={`datepicker-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="datepicker-trigger-left">
            <CalendarIcon size={15} color="var(--status-info)" />
            <span style={{ fontWeight: 600 }}>
              {formatDateHuman(new Date(tempDate + 'T00:00:00'))} at {tempTime}
            </span>
          </div>

          <div className="datepicker-trigger-right">
            <span className="nav-badge nav-badge-neutral" style={{ fontSize: 10 }}>UTC</span>
          </div>
        </div>

        {isOpen && (
          <div className="datepicker-popover" style={{ width: 340 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Maintenance Window Scheduler
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Execution Date
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={tempDate}
                  onChange={(e) => setTempDate(e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Scheduled Maintenance Time
                </label>
                <select
                  className="form-control custom-select"
                  value={tempTime}
                  onChange={(e) => setTempTime(e.target.value)}
                  style={{ fontSize: 12 }}
                >
                  <option value="02:00 AM">02:00 AM (Low Traffic Window)</option>
                  <option value="04:00 AM">04:00 AM (Disaster Recovery Drill)</option>
                  <option value="09:00 AM">09:00 AM (Business Hours Release)</option>
                  <option value="12:00 PM">12:00 PM (Midday Canary Check)</option>
                  <option value="11:30 PM">11:30 PM (Overnight DB Migration)</option>
                </select>
              </div>
            </div>

            <div className="datepicker-footer">
              <span className="datepicker-footer-preview" style={{ fontSize: 11 }}>
                {tempDate} · {tempTime}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={applyDateTime}
                >
                  Confirm Window
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};
