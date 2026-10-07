import React, { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { PublicHoliday } from '../../../data/leaveConfig';
import {
  holidayApplies,
  holidayCreditCode,
  holidayCredits,
  holidayCreditDays,
  observedDate,
  policyAt,
  todayIso,
  typeAt,
  validateHoliday,
  type HolidayCredit
} from '../../../data/leaveEngine';
import { usePaged, Pager } from '../../../components/common/Pager';
import { Field, Messages, Modal, fmtDate, fmtNum } from './shared';

const STATUS_CLS: Record<HolidayCredit['status'], string> = {
  Available: 'success',
  'Partly used': 'primary',
  Used: 'info',
  Expired: 'danger critical',
  Scheduled: 'warning'
};

/** Same day and month in another year (29 Feb falls back to 28 Feb). */
const inYear = (iso: string, year: string) => {
  const md = iso.slice(5);
  const d = new Date(`${year}-${md}T00:00:00`);
  return d.getMonth() + 1 === Number(md.slice(0, 2)) ? `${year}-${md}` : `${year}-02-28`;
};

export const HolidaysTab: React.FC = () => {
  const { tenantEmployees, leaveRequests, leaveCfg, activeTenant, tenantOrganizations, deleteHoliday } = useApp();
  const today = todayIso();
  const [year, setYear] = useState(today.slice(0, 4));
  const [status, setStatus] = useState<'ALL' | HolidayCredit['status']>('ALL');
  const [editing, setEditing] = useState<{ h: PublicHoliday; mode: 'new' | 'edit' | 'duplicate' } | null>(null);
  const policy = policyAt(today, leaveCfg);
  const expiryDays = holidayCreditDays(typeAt(holidayCreditCode(leaveCfg), today, leaveCfg), policy);
  const siteName = (loc: string) => (loc === 'ALL' ? 'All sites' : tenantOrganizations.find((o) => o.id === loc)?.name ?? loc);

  const credits = useMemo(() => holidayCredits(tenantEmployees, leaveRequests, today, leaveCfg), [tenantEmployees, leaveRequests, today, leaveCfg]);
  const years = [...new Set([...leaveCfg.holidays.map((h) => h.date.slice(0, 4)), String(Number(today.slice(0, 4)) + 1)])].sort();
  const holidays = leaveCfg.holidays.filter((h) => h.date.startsWith(year));
  const shown = credits.filter((c) => status === 'ALL' || c.status === status);
  const count = (s: HolidayCredit['status']) => credits.filter((c) => c.status === s).length;
  const sumBy = (f: (c: HolidayCredit) => number) => fmtNum(credits.reduce((s, c) => s + f(c), 0));
  const next = leaveCfg.holidays.filter((h) => holidayApplies(h, activeTenant.id)).find((h) => observedDate(h) >= today);
  const hp = usePaged(holidays, 25, year);
  const cp = usePaged(shown, 25, status);

  const blank = (): PublicHoliday => ({ id: `HOL-${Date.now().toString(36)}`, date: `${year}-01-01`, name: '', kind: 'Company', location: activeTenant.id });

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Next holiday</div>
          <div className="hr-stat-value" style={{ fontSize: 20 }}>
            {next ? next.name : '—'}
          </div>
          <div className="hr-stat-subtext">
            {next ? `${fmtDate(observedDate(next), { weekday: 'long', day: 'numeric', month: 'long' })} · ${credits.filter((c) => c.holidayDate === observedDate(next)).length} rostered` : ''}
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Credits available</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-success)' }}>
            {sumBy((c) => c.remaining)}
          </div>
          <div className="hr-stat-subtext">{count('Available') + count('Partly used')} credits not yet used or expired</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Used as days off</div>
          <div className="hr-stat-value">{sumBy((c) => c.used)}</div>
          <div className="hr-stat-subtext">Across {count('Used') + count('Partly used')} credits</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Expired unused</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-critical)' }}>
            {sumBy((c) => c.forfeited)}
          </div>
          <div className="hr-stat-subtext">
            Credits expire {expiryDays} days after the holiday ({policy.holidayCreditPerDay} day per day worked)
          </div>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Holiday calendar</h3>
            <p>Public holidays as gazetted, plus company holidays for one site or all. Day counts use the observed date; a holiday added after leave was approved refunds that day.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setEditing({ h: blank(), mode: 'new' })}>
              <Plus size={14} /> Add holiday
            </button>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Observed</th>
                <th>Holiday</th>
                <th>Type</th>
                <th>Applies to</th>
                <th className="lv-num">Worked</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hp.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="lv-empty">
                    No holidays in {year} yet. Add one or duplicate last year's.
                  </td>
                </tr>
              )}
              {hp.rows.map((h) => {
                const worked = credits.filter((c) => c.holidayDate === observedDate(h));
                return (
                  <tr key={h.id} className={observedDate(h) < today ? 'lv-row-muted' : ''}>
                    <td>
                      {fmtDate(h.date)}
                      <div className="lv-muted">{fmtDate(h.date, { weekday: 'long' })}</div>
                    </td>
                    <td>{h.observed && h.observed !== h.date ? fmtDate(h.observed, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Same day'}</td>
                    <td className="lv-strong">{h.name}</td>
                    <td>
                      <span className={`digicraft-status-pill ${h.kind === 'Public' ? 'primary' : 'info'}`}>{h.kind}</span>
                    </td>
                    <td>{siteName(h.location)}</td>
                    <td className="lv-num">{worked.length || '—'}</td>
                    <td className="lv-wrap">
                      {h.note ?? ''}
                      {h.gazettedOn && <div className="lv-muted">Declared {fmtDate(h.gazettedOn)}; leave approved earlier over it is refunded</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ h, mode: 'edit' })} aria-label={`Edit ${h.name}`}>
                          <Pencil size={12} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Copy to another year"
                          onClick={() => {
                            const y = String(Number(h.date.slice(0, 4)) + 1);
                            setEditing({ h: { ...h, id: `HOL-${Date.now().toString(36)}`, date: inYear(h.date, y), observed: undefined, gazettedOn: undefined }, mode: 'duplicate' });
                          }}
                        >
                          <Copy size={12} /> Copy
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => deleteHoliday(h.id)} aria-label={`Delete ${h.name}`}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={hp} noun="holidays" />
      </div>

      <div className="hr-table-card">
        <div className="lv-toolbar">
          <strong style={{ fontSize: 13 }}>Holiday credits</strong>
          <span className="lv-muted">
            {policy.holidayCreditPerDay} day per holiday worked (half for a half day), once per holiday, from attendance, roster or an approved claim; expires after {expiryDays} days.
          </span>
          <span className="lv-grow" />
          <div className="digicraft-filter-pills">
            {(['ALL', 'Available', 'Partly used', 'Used', 'Expired', 'Scheduled'] as const).map((s) => (
              <button key={s} className={`digicraft-filter-pill ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                {s === 'ALL' ? `All (${credits.length})` : `${s === 'Scheduled' ? 'Rostered' : s} (${count(s)})`}
              </button>
            ))}
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Holiday</th>
                <th>Date</th>
                <th>Employee</th>
                <th className="lv-num">Worked</th>
                <th className="lv-num">Credited</th>
                <th className="lv-num">Used</th>
                <th>Expires</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {cp.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="lv-empty">
                    No holiday credits for this filter.
                  </td>
                </tr>
              )}
              {cp.rows.map((c) => (
                <tr key={c.id}>
                  <td className="lv-strong">{c.holiday}</td>
                  <td>{fmtDate(c.holidayDate)}</td>
                  <td>
                    {c.fullName}
                    <div className="lv-muted">
                      {c.staffId} · {c.department}
                    </div>
                  </td>
                  <td className="lv-num">{c.worked === 1 ? '1 day' : 'Half day'}</td>
                  <td className="lv-num lv-pos">+{fmtNum(c.credited)}</td>
                  <td className="lv-num">{c.used ? fmtNum(c.used) : '—'}</td>
                  <td>{fmtDate(c.expires)}</td>
                  <td>{c.source}</td>
                  <td>
                    <span className={`digicraft-status-pill ${STATUS_CLS[c.status]}`}>{c.status === 'Scheduled' ? 'Rostered' : c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={cp} noun="credits" />
      </div>

      {editing && (
        <HolidayModal
          initial={editing.h}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={(y) => {
            setYear(y);
            setEditing(null);
          }}
        />
      )}
    </>
  );
};

const HolidayModal: React.FC<{ initial: PublicHoliday; mode: 'new' | 'edit' | 'duplicate'; onClose: () => void; onSaved: (year: string) => void }> = ({ initial, mode, onClose, onSaved }) => {
  const { leaveHolidays, saveHoliday, tenantOrganizations } = useApp();
  const [h, setH] = useState<PublicHoliday>(initial);
  const set = <K extends keyof PublicHoliday>(k: K, v: PublicHoliday[K]) => setH((x) => ({ ...x, [k]: v }));
  const errors = validateHoliday(h, leaveHolidays);
  const dow = h.date ? new Date(`${h.date}T00:00:00`).getDay() : -1;

  return (
    <Modal
      size="md"
      title={mode === 'edit' ? `Edit ${initial.name}` : mode === 'duplicate' ? `Copy ${initial.name}` : 'Add holiday'}
      subtitle={mode === 'duplicate' ? 'Check the date for the new year; moveable holidays (Easter, Eid) change every year.' : 'Requests, holiday credits and refunds use it as soon as it is saved.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={errors.length > 0} onClick={() => saveHoliday(h) && onSaved(h.date.slice(0, 4))}>
            {mode === 'edit' ? 'Save holiday' : 'Add holiday'}
          </button>
        </>
      }
    >
      <div className="lv-form-grid">
        <Field label="Name" className="lv-span-2">
          <input className="form-control" value={h.name} placeholder="e.g. Company sports day" onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" value={h.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Observed on (if different)" hint={dow === 0 ? 'Falls on a Sunday; set the gazetted observed day.' : undefined}>
          <input className="form-control" type="date" value={h.observed ?? ''} min={h.date} onChange={(e) => set('observed', e.target.value || undefined)} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={h.kind} onChange={(e) => set('kind', e.target.value as PublicHoliday['kind'])}>
            <option value="Public">Public (gazetted)</option>
            <option value="Company">Company</option>
          </select>
        </Field>
        <Field label="Applies to">
          <select className="form-control" value={h.location} onChange={(e) => set('location', e.target.value)}>
            <option value="ALL">All sites</option>
            {tenantOrganizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="lv-span-2">
          <input className="form-control" value={h.note ?? ''} onChange={(e) => set('note', e.target.value || undefined)} />
        </Field>
      </div>
      <Messages errors={errors} ok={errors.length ? undefined : `${h.name || 'Holiday'} on ${fmtDate(h.observed || h.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`} />
    </Modal>
  );
};
