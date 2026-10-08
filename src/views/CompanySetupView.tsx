import React, { useMemo, useRef, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Upload,
  Trash2,
  Save,
  RotateCcw,
  IdCard,
  CalendarRange,
  Clock3,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Info,
  Users
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { OrgSettings, RoundingDirection, RoundingStep, TenantOrganization } from '../types';
import {
  INDUSTRIES,
  MONTH_NAMES,
  activePeriodFor,
  defaultOrgSettings,
  orgAdvisories,
  overtimeHourly,
  roundNetPay,
  settingsFor,
  validateOrg
} from '../data/orgSettings';
import { TextField, SelectField } from './hr/employee-wizard/WizardSteps';
import { OrgStructurePanel } from './hr/hcm/OrgStructurePanel';

type Tab = 'profile' | 'statutory' | 'periods' | 'pay' | 'rules' | 'structure';

const TABS: { id: Tab; label: string; icon: React.ElementType; fields: string[] }[] = [
  { id: 'profile', label: 'Identity & contact', icon: Building2, fields: ['legalName', 'displayName', 'code', 'location', 'email', 'website'] },
  { id: 'statutory', label: 'Registration & PINs', icon: IdCard, fields: ['kraPin'] },
  { id: 'periods', label: 'Active periods', icon: CalendarRange, fields: ['payDay', 'cutOffDay'] },
  { id: 'pay', label: 'Overtime & rounding', icon: Clock3, fields: ['overtime.'] },
  { id: 'rules', label: 'Probation, retirement & leave', icon: ShieldCheck, fields: ['probation.', 'retirement.', 'leave.'] },
  { id: 'structure', label: 'Organisation structure', icon: Building2, fields: [] }
];

interface Draft {
  name: string;
  code: string;
  entityType: string;
  location: string;
  settings: OrgSettings;
}

const draftFrom = (org: TenantOrganization, index: number): Draft => ({
  name: org.name,
  code: org.code,
  entityType: org.entityType,
  location: org.location,
  settings: settingsFor(org, index)
});

const NEW_ID = '__new__';
const kes = (n: number, decimals = false) =>
  `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export const CompanySetupView: React.FC = () => {
  const { tenantOrganizations, addTenantOrganization, updateTenantOrganization, selectedOrgId, setSelectedOrgId, addToast, setCurrentView } = useApp();
  const [editingId, setEditingId] = useState<string>(selectedOrgId);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('profile');
  const [tried, setTried] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);

  const isNew = editingId === NEW_ID;
  const editingIndex = tenantOrganizations.findIndex((t) => t.id === editingId);
  const original = useMemo<Draft>(
    () =>
      isNew
        ? { name: '', code: '', entityType: '', location: '', settings: defaultOrgSettings(undefined, tenantOrganizations.length) }
        : draftFrom(tenantOrganizations[editingIndex] ?? tenantOrganizations[0], Math.max(0, editingIndex)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingId, tenantOrganizations]
  );
  const [draft, setDraft] = useState<Draft>(original);
  const [draftFor, setDraftFor] = useState(editingId);
  if (draftFor !== editingId) {
    setDraft(original);
    setDraftFor(editingId);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const otherCodes = tenantOrganizations.filter((t) => t.id !== editingId).map((t) => t.code);
  const errors = validateOrg(draft.settings.legalName, draft.code, draft.location, draft.settings, otherCodes);
  const advisories = orgAdvisories(draft.settings);
  const err = (k: string) => (tried ? errors[k] : undefined);
  const tabErrors = (t: (typeof TABS)[number]) => Object.keys(errors).filter((k) => t.fields.some((f) => (f.endsWith('.') ? k.startsWith(f) : k === f))).length;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setS = (patch: Partial<OrgSettings>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setNested = <K extends 'overtime' | 'probation' | 'retirement' | 'leave' | 'rounding'>(key: K, patch: Partial<OrgSettings[K]>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: { ...d.settings[key], ...patch } } }));
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const selectCompany = (id: string) => {
    if (id === editingId) return;
    if (dirty) setPendingSwitch(id);
    else {
      setEditingId(id);
      setTried(false);
      setTab('profile');
    }
  };

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length) {
      const first = TABS.find((t) => tabErrors(t) > 0);
      if (first) setTab(first.id);
      return;
    }
    const s = draft.settings;
    const payload = {
      name: s.legalName.trim(),
      code: draft.code,
      entityType: draft.entityType.trim() || s.industry || 'Operating company',
      location: draft.location.trim(),
      settings: { ...s, legalName: s.legalName.trim(), displayName: s.displayName.trim() }
    };
    if (isNew) {
      const created = addTenantOrganization({ ...payload, employeeCount: 0, activePayrollBatchKes: 0, complianceRating: 'New company — setup in progress' });
      setEditingId(created.id);
      setDraftFor(created.id);
      addToast({ type: 'success', title: 'Company created', message: `${payload.settings.displayName} was added. Switch to it from the company menu to start adding employees.` });
    } else {
      updateTenantOrganization(editingId, payload);
      addToast({ type: 'success', title: 'Company settings saved', message: `${payload.settings.displayName} was updated.` });
    }
    // Mirror what was stored so the editor shows no pending changes
    setDraft({ name: payload.name, code: payload.code, entityType: payload.entityType, location: payload.location, settings: payload.settings });
    setTried(false);
  };

  const filtered = tenantOrganizations.filter((t) => {
    const s = settingsFor(t);
    const q = query.toLowerCase();
    return !q || s.displayName.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q);
  });

  return (
    <div className="co-page">
      <header className="co-page-head">
        <div>
          <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
            <ArrowLeft size={13} /> Apps Launcher
          </button>
          <h1>Company setup</h1>
          <p>Create companies and manage their identity, statutory numbers, periods and payroll rules.</p>
        </div>
        <button className="btn btn-primary" onClick={() => selectCompany(NEW_ID)}>
          <Plus size={15} /> New company
        </button>
      </header>

      <div className="co-layout">
        {/* Company list */}
        <aside className="co-list-panel">
          <div className="ess-search">
            <Search size={14} />
            <input placeholder="Search companies" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search companies" />
          </div>
          <ul className="co-company-list">
            {isNew && (
              <li>
                <button className="co-company active">
                  <span className="co-logo" style={{ background: draft.settings.brandColor }}>
                    <Plus size={16} />
                  </span>
                  <span className="co-company-text">
                    <b>{draft.settings.displayName || 'New company'}</b>
                    <small>Not saved yet</small>
                  </span>
                </button>
              </li>
            )}
            {filtered.map((t) => {
              const s = settingsFor(t, tenantOrganizations.indexOf(t));
              return (
                <li key={t.id}>
                  <button className={`co-company ${t.id === editingId ? 'active' : ''}`} onClick={() => selectCompany(t.id)}>
                    <CompanyLogo settings={s} />
                    <span className="co-company-text">
                      <b>{s.displayName}</b>
                      <small>
                        {t.code} · {t.employeeCount.toLocaleString()} staff
                      </small>
                    </span>
                    <span className="co-company-tags">
                      {t.id === selectedOrgId && <span className="badge badge-success">In use</span>}
                      {s.status === 'INACTIVE' && <span className="badge badge-neutral">Inactive</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Editor */}
        <section className="co-editor">
          <div className="co-editor-head">
            <CompanyLogo settings={draft.settings} size={52} />
            <div className="co-editor-title">
              <h2>{draft.settings.displayName || (isNew ? 'New company' : draft.name)}</h2>
              <span>
                {draft.settings.legalName || 'Legal name not set'}
                {draft.code ? ` · ${draft.code}` : ''} · {activePeriodFor(draft.settings).label}
              </span>
            </div>
            {!isNew && editingId !== selectedOrgId && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedOrgId(editingId);
                  addToast({ type: 'info', title: 'Company switched', message: `Now working in ${draft.settings.displayName}.` });
                }}
              >
                <ArrowRightLeft size={14} /> Use this company
              </button>
            )}
          </div>

          <nav className="co-tabs" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              const n = tried ? tabErrors(t) : 0;
              return (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={`co-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                  <Icon size={15} /> {t.label}
                  {n > 0 && <span className="co-tab-err">{n}</span>}
                </button>
              );
            })}
          </nav>

          <div className="co-editor-body" key={`${editingId}-${tab}`}>
            {tab === 'profile' && <ProfileTab draft={draft} set={set} setS={setS} err={err} />}
            {tab === 'statutory' && <StatutoryTab s={draft.settings} setS={setS} err={err} />}
            {tab === 'periods' && <PeriodsTab s={draft.settings} setS={setS} err={err} num={num} />}
            {tab === 'pay' && <PayRulesTab s={draft.settings} setNested={setNested} err={err} num={num} />}
            {tab === 'rules' && <RulesTab s={draft.settings} setNested={setNested} err={err} num={num} />}
            {tab === 'structure' && <OrgStructurePanel />}

            {advisories.filter((a) => TABS.find((t) => t.id === tab)!.fields.some((f) => (f.endsWith('.') ? a.field.startsWith(f) : a.field === f))).length > 0 && (
              <ul className="co-advisories">
                {advisories
                  .filter((a) => TABS.find((t) => t.id === tab)!.fields.some((f) => (f.endsWith('.') ? a.field.startsWith(f) : a.field === f)))
                  .map((a) => (
                    <li key={a.field}>
                      <AlertTriangle size={14} /> {a.text}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <footer className={`co-savebar ${dirty || isNew ? 'show' : ''}`}>
            {pendingSwitch ? (
              <>
                <span className="co-savebar-text">
                  <AlertTriangle size={14} /> You have unsaved changes.
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => setPendingSwitch(null)}>
                  Keep editing
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setEditingId(pendingSwitch);
                    setPendingSwitch(null);
                    setTried(false);
                    setTab('profile');
                  }}
                >
                  Discard changes
                </button>
              </>
            ) : (
              <>
                <span className="co-savebar-text">
                  {tried && Object.keys(errors).length ? (
                    <>
                      <AlertTriangle size={14} /> Fix {Object.keys(errors).length} field{Object.keys(errors).length === 1 ? '' : 's'} before saving
                    </>
                  ) : isNew ? (
                    <>
                      <Info size={14} /> New company — fill in the required fields and save
                    </>
                  ) : (
                    <>
                      <Info size={14} /> Unsaved changes
                    </>
                  )}
                </span>
                {isNew ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(selectedOrgId)}>
                    Cancel
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => setDraft(original)} disabled={!dirty}>
                    <RotateCcw size={14} /> Discard
                  </button>
                )}
                <button className="btn btn-primary btn-sm" onClick={save}>
                  <Save size={14} /> {isNew ? 'Create company' : 'Save changes'}
                </button>
              </>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

export const CompanyLogo: React.FC<{ settings: OrgSettings; size?: number }> = ({ settings, size = 38 }) => {
  const initials = (settings.displayName || settings.legalName || '?')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return settings.logoUrl ? (
    <img className="co-logo co-logo-img" src={settings.logoUrl} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="co-logo" style={{ width: size, height: size, background: settings.brandColor, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
};

type Err = (k: string) => string | undefined;

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <label className="co-toggle">
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="co-switch" aria-hidden="true" />
    <span className="co-toggle-text">
      <b>{label}</b>
      {hint && <small>{hint}</small>}
    </span>
  </label>
);

const Group: React.FC<{ title: string; desc?: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ title, desc, children, aside }) => (
  <section className="co-group">
    <div className="co-group-head">
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

/* ---------- Identity & contact ---------- */

const ProfileTab: React.FC<{ draft: Draft; set: (p: Partial<Draft>) => void; setS: (p: Partial<OrgSettings>) => void; err: Err }> = ({ draft, set, setS, err }) => {
  const s = draft.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const { addToast } = useApp();
  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(f.type) || f.size > 1024 * 1024) {
      addToast({ type: 'warning', title: 'Logo not accepted', message: 'Use a PNG, JPG, SVG or WebP image under 1 MB.' });
      return;
    }
    const r = new FileReader();
    r.onload = () => setS({ logoUrl: String(r.result) });
    r.readAsDataURL(f);
  };

  return (
    <>
      <Group title="Names" desc="The legal name appears on payslips, P9s and statutory returns. The display name is used across the app.">
        <div className="ew-grid ew-grid-2">
          <TextField label="Legal / registered name" required value={s.legalName} onChange={(v) => setS({ legalName: v })} error={err('legalName')} placeholder="e.g. Acme Holdings Limited" />
          <TextField label="Display name" required value={s.displayName} onChange={(v) => setS({ displayName: v })} error={err('displayName')} placeholder="e.g. Acme" hint="Short name shown in menus and headers" />
          <TextField label="Company code" required value={draft.code} onChange={(v) => set({ code: v.toUpperCase().replace(/\s/g, '') })} error={err('code')} hint="Used as a prefix on staff IDs and reports" />
          <SelectField label="Industry" value={s.industry} onChange={(v) => setS({ industry: v })} options={INDUSTRIES} />
          <TextField label="Business type / description" span={2} value={draft.entityType} onChange={(v) => set({ entityType: v })} placeholder="e.g. Head office & operations" />
        </div>
      </Group>

      <Group title="Logo & colour" desc="Shown on payslips, the company menu and documents. Transparent PNG or SVG works best.">
        <div className="co-logo-row">
          <CompanyLogo settings={s} size={72} />
          <div className="co-logo-actions">
            <div className="ess-inline-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> {s.logoUrl ? 'Replace logo' : 'Upload logo'}
              </button>
              {s.logoUrl && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setS({ logoUrl: undefined })}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <small className="ew-hint">PNG, JPG, SVG or WebP · max 1 MB · square images look best</small>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={onLogo} />
          </div>
          <label className="req-field co-color">
            <span>Brand colour</span>
            <span className="co-color-input">
              <input type="color" value={s.brandColor} onChange={(e) => setS({ brandColor: e.target.value })} aria-label="Brand colour" />
              <code>{s.brandColor}</code>
            </span>
          </label>
        </div>
      </Group>

      <Group title="Contact & location">
        <div className="ew-grid ew-grid-2">
          <TextField label="Location / town" required value={draft.location} onChange={(v) => set({ location: v })} error={err('location')} />
          <TextField label="Physical address" value={s.physicalAddress} onChange={(v) => setS({ physicalAddress: v })} />
          <TextField label="Postal address" value={s.postalAddress} onChange={(v) => setS({ postalAddress: v })} placeholder="P.O. Box 1234-00100 Nairobi" />
          <TextField label="Phone" type="tel" value={s.phone} onChange={(v) => setS({ phone: v })} />
          <TextField label="Email" type="email" value={s.email} onChange={(v) => setS({ email: v })} error={err('email')} placeholder="hr@company.co.ke" />
          <TextField label="Website" value={s.website} onChange={(v) => setS({ website: v })} error={err('website')} />
        </div>
      </Group>

      <Group title="Status">
        <Toggle
          checked={s.status === 'ACTIVE'}
          onChange={(v) => setS({ status: v ? 'ACTIVE' : 'INACTIVE' })}
          label={s.status === 'ACTIVE' ? 'Active' : 'Inactive'}
          hint="Inactive companies keep their records but can't run payroll or add employees"
        />
      </Group>
    </>
  );
};

/* ---------- Registration & PINs ---------- */

const StatutoryTab: React.FC<{ s: OrgSettings; setS: (p: Partial<OrgSettings>) => void; err: Err }> = ({ s, setS, err }) => (
  <Group title="Registration & statutory numbers" desc="Used on statutory returns, remittance files, payslips and P9 cards.">
    <div className="ew-grid ew-grid-2">
      <TextField label="KRA PIN" value={s.kraPin} onChange={(v) => setS({ kraPin: v.toUpperCase().trim() })} error={err('kraPin')} placeholder="P051234567X" />
      <TextField label="Business registration no." value={s.businessRegNo} onChange={(v) => setS({ businessRegNo: v })} placeholder="e.g. PVT-AB1CD2EF" />
      <TextField label="NSSF employer number" value={s.nssfEmployerNo} onChange={(v) => setS({ nssfEmployerNo: v })} />
      <TextField label="SHIF employer number" value={s.shifEmployerNo} onChange={(v) => setS({ shifEmployerNo: v })} />
      <TextField label="Housing levy employer code" value={s.housingLevyNo} onChange={(v) => setS({ housingLevyNo: v })} />
      <TextField label="NITA registration no." value={s.nitaNo} onChange={(v) => setS({ nitaNo: v })} />
    </div>
  </Group>
);

/* ---------- Periods ---------- */

const PeriodsTab: React.FC<{ s: OrgSettings; setS: (p: Partial<OrgSettings>) => void; err: Err; num: (v: string) => number }> = ({ s, setS, err, num }) => {
  const period = activePeriodFor(s);
  const t = today();
  const y = new Date().getFullYear();
  return (
    <>
      <Group title="Year type" desc="Drives leave years, payroll reporting and year-end processing.">
        <div className="ew-method" role="radiogroup" aria-label="Year type">
          <button type="button" role="radio" aria-checked={s.periodType === 'CALENDAR'} className={s.periodType === 'CALENDAR' ? 'active' : ''} onClick={() => setS({ periodType: 'CALENDAR' })}>
            Calendar year (Jan – Dec)
          </button>
          <button type="button" role="radio" aria-checked={s.periodType === 'FINANCIAL'} className={s.periodType === 'FINANCIAL' ? 'active' : ''} onClick={() => setS({ periodType: 'FINANCIAL' })}>
            Financial year
          </button>
        </div>
        <div className="ew-grid">
          {s.periodType === 'FINANCIAL' && (
            <label className="req-field">
              <span>Financial year starts in</span>
              <select className="form-control" value={s.fyStartMonth} onChange={(e) => setS({ fyStartMonth: Number(e.target.value) })}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="req-field">
            <span>Active period starts in year</span>
            <select className="form-control" value={s.activeYear} onChange={(e) => setS({ activeYear: Number(e.target.value) })}>
              {[y - 2, y - 1, y, y + 1].map((yr) => (
                <option key={yr}>{yr}</option>
              ))}
            </select>
          </label>
          <TextField label="Payroll cut-off day" required type="number" min="1" max="31" value={String(s.cutOffDay)} onChange={(v) => setS({ cutOffDay: num(v) })} error={err('cutOffDay')} hint="Last day for overtime, leave & changes" />
          <TextField label="Pay day" required type="number" min="1" max="31" value={String(s.payDay)} onChange={(v) => setS({ payDay: num(v) })} error={err('payDay')} hint="Shorter months use their last day" />
        </div>
      </Group>

      <Group
        title={period.label}
        desc={`${new Date(period.start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} – ${new Date(period.end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        aside={<span className={`badge ${t >= period.start && t <= period.end ? 'badge-success' : 'badge-warning'}`}>{t >= period.start && t <= period.end ? 'Current' : t < period.start ? 'Future' : 'Past'}</span>}
      >
        <div className="co-period-table">
          <table className="hr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Payroll month</th>
                <th>Cut-off</th>
                <th>Pay date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {period.months.map((m, i) => {
                const status = t > m.end ? 'Closed' : t >= m.start ? 'Open' : 'Upcoming';
                return (
                  <tr key={m.start} className={status === 'Open' ? 'co-current' : ''}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td>{new Date(m.cutOff + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td>{new Date(m.payDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td>
                      <span className={`digicraft-status-pill ${status === 'Open' ? 'success' : status === 'Closed' ? 'info' : 'warning'}`}>{status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Group>
    </>
  );
};

/* ---------- Overtime & rounding ---------- */

const PayRulesTab: React.FC<{
  s: OrgSettings;
  setNested: <K extends 'overtime' | 'probation' | 'retirement' | 'leave' | 'rounding'>(key: K, patch: Partial<OrgSettings[K]>) => void;
  err: Err;
  num: (v: string) => number;
}> = ({ s, setNested, err, num }) => {
  const o = s.overtime;
  const r = s.rounding;
  const sample = 120000;
  const sampleNet = 98427.63;
  const rounded = roundNetPay(sampleNet, r.netPayStep, r.netPayDirection);
  return (
    <>
      <Group title="Overtime" aside={<Toggle checked={o.enabled} onChange={(v) => setNested('overtime', { enabled: v })} label={o.enabled ? 'Enabled' : 'Disabled'} />}>
        {o.enabled ? (
          <>
            <div className="ew-grid">
              <TextField label="Weekday rate (×)" type="number" min="1" value={String(o.weekdayRate)} onChange={(v) => setNested('overtime', { weekdayRate: num(v) })} error={err('overtime.weekdayRate')} />
              <TextField label="Rest day rate (×)" type="number" min="1" value={String(o.restDayRate)} onChange={(v) => setNested('overtime', { restDayRate: num(v) })} error={err('overtime.restDayRate')} />
              <TextField label="Public holiday rate (×)" type="number" min="1" value={String(o.holidayRate)} onChange={(v) => setNested('overtime', { holidayRate: num(v) })} error={err('overtime.holidayRate')} />
              <label className="req-field">
                <span>Calculated on</span>
                <select className="form-control" value={o.basis} onChange={(e) => setNested('overtime', { basis: e.target.value as OrgSettings['overtime']['basis'] })}>
                  <option value="BASIC">Basic salary</option>
                  <option value="GROSS">Gross pay</option>
                </select>
              </label>
              <TextField
                label="Standard hours / month"
                type="number"
                value={String(o.standardMonthlyHours)}
                onChange={(v) => setNested('overtime', { standardMonthlyHours: num(v) })}
                error={err('overtime.standardMonthlyHours')}
                hint="Divides monthly pay into an hourly rate"
              />
              <TextField label="Max overtime hours / month" type="number" value={String(o.maxHoursPerMonth)} onChange={(v) => setNested('overtime', { maxHoursPerMonth: num(v) })} />
              <label className="req-field">
                <span>Round overtime time to</span>
                <select className="form-control" value={o.minimumBlockMinutes} onChange={(e) => setNested('overtime', { minimumBlockMinutes: Number(e.target.value) })}>
                  {[1, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m === 1 ? 'Exact minutes' : `${m}-minute blocks`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Toggle checked={o.requiresApproval} onChange={(v) => setNested('overtime', { requiresApproval: v })} label="Overtime needs manager approval before payroll" />
            <div className="co-preview">
              <span className="co-preview-label">Example — {o.basis === 'BASIC' ? 'basic salary' : 'gross pay'} of {kes(sample)}</span>
              <div className="co-preview-row">
                <div>
                  <span>Hourly rate</span>
                  <b>{kes(overtimeHourly(sample, o.standardMonthlyHours, 1))}</b>
                </div>
                <div>
                  <span>Weekday OT / hr</span>
                  <b>{kes(overtimeHourly(sample, o.standardMonthlyHours, o.weekdayRate))}</b>
                </div>
                <div>
                  <span>Rest day OT / hr</span>
                  <b>{kes(overtimeHourly(sample, o.standardMonthlyHours, o.restDayRate))}</b>
                </div>
                <div>
                  <span>Holiday OT / hr</span>
                  <b>{kes(overtimeHourly(sample, o.standardMonthlyHours, o.holidayRate))}</b>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="ew-hint">Overtime can't be captured or paid for this company.</p>
        )}
      </Group>

      <Group title="Rounding" desc="Applied when payroll is calculated.">
        <div className="ew-grid">
          <label className="req-field">
            <span>Round net pay to</span>
            <select className="form-control" value={r.netPayStep} onChange={(e) => setNested('rounding', { netPayStep: Number(e.target.value) as RoundingStep })}>
              <option value={0}>No rounding (cents)</option>
              <option value={1}>Nearest shilling</option>
              <option value={5}>Nearest 5</option>
              <option value={10}>Nearest 10</option>
              <option value={50}>Nearest 50</option>
              <option value={100}>Nearest 100</option>
            </select>
          </label>
          <label className="req-field">
            <span>Direction</span>
            <select
              className="form-control"
              value={r.netPayDirection}
              disabled={!r.netPayStep}
              onChange={(e) => setNested('rounding', { netPayDirection: e.target.value as RoundingDirection })}
            >
              <option value="NEAREST">Nearest</option>
              <option value="UP">Always up</option>
              <option value="DOWN">Always down</option>
            </select>
          </label>
          <label className="req-field">
            <span>PAYE rounding</span>
            <select className="form-control" value={r.taxRounding} onChange={(e) => setNested('rounding', { taxRounding: e.target.value as OrgSettings['rounding']['taxRounding'] })}>
              <option value="NEAREST">Nearest shilling</option>
              <option value="DOWN">Round down</option>
            </select>
          </label>
        </div>
        <div className="co-toggle-stack">
          <Toggle
            checked={r.carryForward}
            onChange={(v) => setNested('rounding', { carryForward: v })}
            label="Carry the rounding difference to next month"
            hint="Keeps totals exact over the year instead of absorbing the difference"
          />
          <Toggle checked={r.showDecimals} onChange={(v) => setNested('rounding', { showDecimals: v })} label="Show cents on payslips" />
        </div>
        <div className="co-preview">
          <span className="co-preview-label">Example</span>
          <div className="co-preview-row">
            <div>
              <span>Calculated net</span>
              <b>{kes(sampleNet, true)}</b>
            </div>
            <div>
              <span>Paid</span>
              <b>{kes(rounded.paid, r.showDecimals || !r.netPayStep)}</b>
            </div>
            <div>
              <span>Adjustment</span>
              <b className={rounded.adjustment >= 0 ? 'pos' : 'neg'}>
                {rounded.adjustment >= 0 ? '+' : '−'}
                {kes(Math.abs(rounded.adjustment), true)}
              </b>
            </div>
            <div>
              <span>Next month</span>
              <b>{r.carryForward && rounded.adjustment ? `${rounded.adjustment > 0 ? 'deduct' : 'add'} ${kes(Math.abs(rounded.adjustment), true)}` : 'No carry-forward'}</b>
            </div>
          </div>
        </div>
      </Group>
    </>
  );
};

/* ---------- Probation, retirement & leave ---------- */

const RulesTab: React.FC<{
  s: OrgSettings;
  setNested: <K extends 'overtime' | 'probation' | 'retirement' | 'leave' | 'rounding'>(key: K, patch: Partial<OrgSettings[K]>) => void;
  err: Err;
  num: (v: string) => number;
}> = ({ s, setNested, err, num }) => {
  const { tenantEmployees } = useApp();
  const p = s.probation;
  const r = s.retirement;
  const l = s.leave;
  const nearRetirement = tenantEmployees.filter((e) => {
    if (!e.dateOfBirth) return false;
    const d = new Date(e.dateOfBirth + 'T00:00:00');
    d.setFullYear(d.getFullYear() + r.normalAge);
    const months = (d.getTime() - Date.now()) / (30.44 * 86400000);
    return months >= 0 && months <= r.reminderMonths;
  }).length;

  return (
    <>
      <Group title="Probation" desc="New employees get these defaults; they can be changed per employee.">
        <div className="ew-grid">
          <TextField label="Default probation (months)" type="number" value={String(p.defaultMonths)} onChange={(v) => setNested('probation', { defaultMonths: num(v) })} error={err('probation.defaultMonths')} />
          <TextField label="Maximum incl. extension" type="number" value={String(p.maxMonths)} onChange={(v) => setNested('probation', { maxMonths: num(v) })} error={err('probation.maxMonths')} />
          <TextField label="Notice during probation (days)" type="number" value={String(p.noticeDays)} onChange={(v) => setNested('probation', { noticeDays: num(v) })} />
          <TextField label="Remind manager (days before end)" type="number" value={String(p.reminderDays)} onChange={(v) => setNested('probation', { reminderDays: num(v) })} />
        </div>
        <Toggle checked={p.allowExtension} onChange={(v) => setNested('probation', { allowExtension: v })} label="Allow probation to be extended" hint={`Up to ${p.maxMonths} months in total`} />
      </Group>

      <Group title="Retirement" desc="Open-ended contracts run until the employee reaches retirement age.">
        <div className="ew-grid">
          <TextField label="Normal retirement age" type="number" value={String(r.normalAge)} onChange={(v) => setNested('retirement', { normalAge: num(v) })} error={err('retirement.normalAge')} />
          <TextField label="Earliest early retirement" type="number" value={String(r.earlyAge)} onChange={(v) => setNested('retirement', { earlyAge: num(v) })} error={err('retirement.earlyAge')} />
          <TextField label="Retirement age — persons with disability" type="number" value={String(r.pwdAge)} onChange={(v) => setNested('retirement', { pwdAge: num(v) })} error={err('retirement.pwdAge')} />
          <TextField label="Notify HR (months before)" type="number" value={String(r.reminderMonths)} onChange={(v) => setNested('retirement', { reminderMonths: num(v) })} />
        </div>
        <p className="ew-hint co-inline-note">
          <Users size={13} /> {nearRetirement} employee{nearRetirement === 1 ? '' : 's'} on record reach{nearRetirement === 1 ? 'es' : ''} retirement within {r.reminderMonths} months.
        </p>
      </Group>

      <Group title="Leave entitlements" desc="Per year, in working days unless noted. Leave years follow the active period.">
        <div className="ew-grid">
          <TextField label="Annual leave" type="number" value={String(l.annualDays)} onChange={(v) => setNested('leave', { annualDays: num(v) })} error={err('leave.annualDays')} />
          <TextField label="Max carry-over to next year" type="number" value={String(l.carryOverMax)} onChange={(v) => setNested('leave', { carryOverMax: num(v) })} error={err('leave.carryOverMax')} />
          <TextField label="Sick leave — full pay" type="number" value={String(l.sickFullPayDays)} onChange={(v) => setNested('leave', { sickFullPayDays: num(v) })} />
          <TextField label="Sick leave — half pay" type="number" value={String(l.sickHalfPayDays)} onChange={(v) => setNested('leave', { sickHalfPayDays: num(v) })} />
          <TextField label="Maternity (calendar days)" type="number" value={String(l.maternityDays)} onChange={(v) => setNested('leave', { maternityDays: num(v) })} />
          <TextField label="Paternity (calendar days)" type="number" value={String(l.paternityDays)} onChange={(v) => setNested('leave', { paternityDays: num(v) })} />
          <TextField label="Compassionate" type="number" value={String(l.compassionateDays)} onChange={(v) => setNested('leave', { compassionateDays: num(v) })} />
        </div>
        <p className="ew-hint co-inline-note">
          <CheckCircle2 size={13} /> Annual leave accrues at {(l.annualDays / 12).toFixed(2)} days per month.
        </p>
      </Group>
    </>
  );
};
