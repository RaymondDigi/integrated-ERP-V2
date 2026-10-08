import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, KeyRound, ListChecks, Plus, ShieldCheck, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAccess } from '../platform/access';
import { MODULE_LABEL, setModuleAccess, useAccessMatrix, type ModuleKey } from '../platform/rbac';
import { decideRoleChange, runRightsReview, setRightsSchedule, useAccessRequests, useRightsRuns, useRightsSchedule } from '../platform/accessRequests';
import { setSecurityPolicy, useSecurityPolicy, type SecurityPolicy } from '../platform/securityPolicy';
import { addCustomField, CUSTOM_ENTITIES, removeCustomField, useCustomFieldDefs, type CustomFieldDef } from '../platform/customFields';
import { FUNCTION_KEYS, savePrefs, usePrefs, type Prefs } from '../platform/prefs';
import { ExportCsvButton } from '../platform/Widgets';
import type { Role } from '../auth/session';
import type { User } from '../types';

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)' };

type R = { ok: true } | { ok: false; error?: string } | { ok: boolean; error?: string };
const useResult = () => {
  const { addToast } = useApp();
  return (r: R, ok: string) => {
    if (!r.ok) addToast({ type: 'error', title: 'Not saved', message: r.error ?? 'Not allowed' });
    else addToast({ type: 'success', title: ok, message: 'Recorded in the audit trail' });
    return r.ok;
  };
};

/* ---------------- Module access (central RBAC) ---------------- */

const ROLES: Exclude<Role, 'employee'>[] = ['admin', 'manager', 'member', 'viewer'];

export const ModuleAccessPanel: React.FC = () => {
  const matrix = useAccessMatrix();
  const access = useAccess();
  const result = useResult();
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <ShieldCheck size={16} /> Module access by sign-in role
        </h3>
        <span style={muted}>Enforced centrally when a screen opens. Viewers are always read-only.</span>
      </div>
      <div className="emc-table-container">
        <table className="emc-table">
          <thead>
            <tr>
              <th className="emc-th">Module</th>
              {ROLES.map((r) => (
                <th key={r} className="emc-th" style={{ textAlign: 'center' }}>
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(MODULE_LABEL) as ModuleKey[]).map((m) => (
              <tr key={m} className="emc-tr">
                <td className="emc-td">{MODULE_LABEL[m]}</td>
                {ROLES.map((r) => (
                  <td key={r} className="emc-td" style={{ textAlign: 'center' }}>
                    <input type="checkbox" aria-label={`${r} can open ${m}`} checked={matrix[r].includes(m)} disabled={r === 'admin'} onChange={(e) => result(setModuleAccess(access.name, r, m, e.target.checked), 'Module access updated')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---------------- Role-change approvals ---------------- */

export const AccessRequestsPanel: React.FC = () => {
  const reqs = useAccessRequests();
  const { changeUserRole } = useApp();
  const access = useAccess();
  const result = useResult();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <KeyRound size={16} /> Role-change requests
        </h3>
        <span style={muted}>Raised from a user's drawer; approved by a different administrator.</span>
      </div>
      {reqs.length === 0 && <span style={muted}>No requests.</span>}
      {reqs.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>
              {r.userName}: {r.fromRole} → {r.toRole}
            </b>
            <div style={muted}>
              {r.requestedBy} · {r.requestedAt} · “{r.reason}”{r.status !== 'PENDING' ? ` · ${r.status.toLowerCase()} by ${r.decidedBy}` : ''}
            </div>
          </div>
          {r.status === 'PENDING' ? (
            <>
              <input className="form-control" style={{ maxWidth: 200 }} placeholder="Note" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} aria-label="Decision note" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => result(decideRoleChange(r.id, access.name, false, notes[r.id] ?? '', () => undefined), 'Request rejected')}>
                <XCircle size={14} /> Reject
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => result(decideRoleChange(r.id, access.name, true, notes[r.id] ?? '', (x) => changeUserRole(x.userId, x.toRole as User['role'])), 'Role changed')}>
                <CheckCircle2 size={14} /> Approve
              </button>
            </>
          ) : (
            <span className={`badge ${r.status === 'APPROVED' ? 'badge-success' : 'badge-neutral'}`}>{r.status}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/* ---------------- User-rights review ---------------- */

const PRIVILEGED = ['Super Admin', 'Organization Admin', 'Security Officer'];

export const RightsReviewPanel: React.FC = () => {
  const { users } = useApp();
  const access = useAccess();
  const sched = useRightsSchedule();
  const runs = useRightsRuns();
  const result = useResult();
  const { addToast } = useApp();
  const [f, setF] = useState({ frequency: sched.frequency, recipients: sched.recipients });
  const stats = { users: users.length, privileged: users.filter((u) => PRIVILEGED.includes(u.role)).length, withoutMfa: users.filter((u) => u.mfa === 'Not Configured').length };
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <ListChecks size={16} /> User-rights review
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportCsvButton name="user-rights-report" header={['User', 'Email', 'Organisation', 'Department', 'Role', 'Privileged', 'Status', 'MFA', 'Last login', 'Direct permissions', 'Inherited permissions']} rows={() => users.map((u) => [u.name, u.email, u.organizationName, u.department, u.role, PRIVILEGED.includes(u.role) ? 'Yes' : 'No', u.status, u.mfa, u.lastLogin, u.directPermissionsCount, u.inheritedPermissionsCount])} label="User rights report (CSV)" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (access.role !== 'admin') return addToast({ type: 'error', title: 'Not allowed', message: access.readOnly ? 'This is a read-only account — you can view records but not change them' : 'Only an administrator runs the review' });
              runRightsReview(access.name, stats);
              addToast({ type: 'success', title: 'Review sent', message: `Emailed to ${sched.recipients}` });
            }}
          >
            Run review now
          </button>
        </div>
      </div>
      <span style={muted}>
        {stats.users} users · {stats.privileged} privileged · {stats.withoutMfa} without MFA · next scheduled run {sched.nextRun}
        {sched.lastRun ? ` · last run ${sched.lastRun}` : ''}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <CalendarClock size={14} />
        <select className="form-control" style={{ maxWidth: 140 }} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as typeof f.frequency })} aria-label="Review frequency">
          {['Weekly', 'Monthly', 'Quarterly'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input className="form-control" style={{ flex: 1, minWidth: 220 }} value={f.recipients} onChange={(e) => setF({ ...f, recipients: e.target.value })} aria-label="Recipients" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => result(setRightsSchedule(access.name, f), 'Schedule saved')}>
          Save schedule
        </button>
      </div>
      {runs.slice(0, 5).map((r) => (
        <span key={r.id} style={muted}>
          {r.at} · {r.by} · {r.users} users, {r.privileged} privileged, {r.withoutMfa} without MFA
        </span>
      ))}
    </div>
  );
};

/* ---------------- MFA and password policy ---------------- */

export const SecurityPolicyPanel: React.FC = () => {
  const policy = useSecurityPolicy();
  const access = useAccess();
  const result = useResult();
  const [f, setF] = useState<SecurityPolicy>(policy);
  const toggle = (r: Role) => setF({ ...f, mfaRoles: f.mfaRoles.includes(r) ? f.mfaRoles.filter((x) => x !== r) : [...f.mfaRoles, r] });
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <ShieldCheck size={16} /> Multi-factor authentication & password policy
        </h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => result(setSecurityPolicy(access.name, f), 'Security policy saved')}>
          Save policy
        </button>
      </div>
      <span style={muted}>Roles ticked must enter an authenticator code at sign-in (demo code 246810). Administrators always need MFA.</span>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {(['admin', 'manager', 'member', 'viewer', 'employee'] as Role[]).map((r) => (
          <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={f.mfaRoles.includes(r)} onChange={() => toggle(r)} /> {r}
          </label>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={muted}>
          Minimum length
          <input className="form-control" type="number" value={f.minLength} onChange={(e) => setF({ ...f, minLength: Number(e.target.value) })} />
        </label>
        <label style={muted}>
          Expiry (days)
          <input className="form-control" type="number" value={f.expiryDays} onChange={(e) => setF({ ...f, expiryDays: Number(e.target.value) })} />
        </label>
        <label style={muted}>
          Lock after failed attempts
          <input className="form-control" type="number" value={f.lockoutAttempts} onChange={(e) => setF({ ...f, lockoutAttempts: Number(e.target.value) })} />
        </label>
        {(['requireNumber', 'requireUpper', 'requireSymbol'] as const).map((k) => (
          <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {k === 'requireNumber' ? 'Needs a number' : k === 'requireUpper' ? 'Needs a capital' : 'Needs a symbol'}
          </label>
        ))}
      </div>
    </div>
  );
};

/* ---------------- Custom fields ---------------- */

export const CustomFieldAdmin: React.FC = () => {
  const defs = useCustomFieldDefs();
  const access = useAccess();
  const result = useResult();
  const [f, setF] = useState<Omit<CustomFieldDef, 'id' | 'key'> & { optionsText: string }>({ entity: 'ict-asset', label: '', type: 'text', required: false, optionsText: '' });
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
          <SlidersHorizontal size={16} /> Custom fields
        </h3>
        <span style={muted}>Add your own fields to records; they appear on the record's drawer.</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} aria-label="Record type">
          {Object.entries(CUSTOM_ENTITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="form-control" style={{ maxWidth: 200 }} placeholder="Field label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="Field label" />
        <select className="form-control" style={{ maxWidth: 130 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CustomFieldDef['type'] })} aria-label="Field type">
          {['text', 'number', 'date', 'select', 'checkbox'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {f.type === 'select' && <input className="form-control" style={{ maxWidth: 220 }} placeholder="Choices, comma separated" value={f.optionsText} onChange={(e) => setF({ ...f, optionsText: e.target.value })} aria-label="Choices" />}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={!!f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Required
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const { optionsText, ...d } = f;
            if (result(addCustomField(access.name, { ...d, options: d.type === 'select' ? optionsText.split(',').map((x) => x.trim()).filter(Boolean) : undefined }), 'Field added')) setF({ ...f, label: '', optionsText: '' });
          }}
        >
          <Plus size={14} /> Add field
        </button>
      </div>
      {Object.entries(CUSTOM_ENTITIES).map(([k, v]) => {
        const list = defs.filter((d) => d.entity === k);
        return list.length ? (
          <div key={k} style={muted}>
            <b>{v}:</b>{' '}
            {list.map((d) => (
              <span key={d.id} style={{ marginRight: 10 }}>
                {d.label} <small>({d.type}{d.required ? ', required' : ''})</small>{' '}
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Remove ${d.label}`} onClick={() => result(removeCustomField(access.name, d.id), 'Field removed')}>
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : null;
      })}
    </div>
  );
};

/* ---------------- Personal preferences ---------------- */

const SHORTCUT_TARGETS: { view: string; label: string }[] = [
  { view: 'approvals', label: 'Approval inbox' },
  { view: 'executive', label: 'Business overview' },
  { view: 'finance', label: 'Finance' },
  { view: 'trading', label: 'Trading' },
  { view: 'procurement', label: 'Procurement' },
  { view: 'warehousing', label: 'Warehousing' },
  { view: 'production', label: 'Production' },
  { view: 'quality', label: 'Quality' },
  { view: 'ict', label: 'ICT service desk' },
  { view: 'governance', label: 'Governance' },
  { view: 'employees', label: 'Employees' }
];

export const PrefsPanel: React.FC = () => {
  const p = usePrefs();
  const { addToast } = useApp();
  const [f, setF] = useState<Prefs>(p);
  const setKey = (key: string, view: string) => {
    const t = SHORTCUT_TARGETS.find((x) => x.view === view);
    setF({ ...f, shortcuts: [...f.shortcuts.filter((s) => s.key !== key), ...(t ? [{ key, view, label: t.label }] : [])] });
  };
  return (
    <div style={card}>
      <div style={head}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Your preferences</h3>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const bad = Object.values(f.decimals).some((n) => !(n >= 0 && n <= 4));
            if (bad) return addToast({ type: 'error', title: 'Not saved', message: 'Decimal places must be between 0 and 4' });
            savePrefs(f);
            addToast({ type: 'success', title: 'Preferences saved', message: 'Kept in this browser for your sign-in' });
          }}
        >
          Save preferences
        </button>
      </div>
      <span style={muted}>Function keys open a screen from anywhere. Decimal places apply to quantities, costs, prices and amounts where screens use them.</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {FUNCTION_KEYS.map((k) => (
          <label key={k} style={muted}>
            {k}
            <select className="form-control" value={f.shortcuts.find((s) => s.key === k)?.view ?? ''} onChange={(e) => setKey(k, e.target.value)}>
              <option value="">— none —</option>
              {SHORTCUT_TARGETS.map((t) => (
                <option key={t.view} value={t.view}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(Object.keys(f.decimals) as (keyof Prefs['decimals'])[]).map((k) => (
          <label key={k} style={muted}>
            Decimals — {k}
            <input className="form-control" type="number" min={0} max={4} value={f.decimals[k]} onChange={(e) => setF({ ...f, decimals: { ...f.decimals, [k]: Number(e.target.value) } })} />
          </label>
        ))}
        <label style={muted}>
          Label printer
          <input className="form-control" value={f.printer} onChange={(e) => setF({ ...f, printer: e.target.value })} />
        </label>
      </div>
    </div>
  );
};
