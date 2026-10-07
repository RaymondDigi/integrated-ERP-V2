import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X, Check, FileText, Pencil, Info, AlertTriangle, RefreshCw, Building2, Smartphone, Settings2, CalendarClock, Accessibility, Ban } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { GRADE_SCALES, KENYAN_BANKS } from '../../../data/orgData';
import { CreatableSelect } from '../../../components/forms/CreatableSelect';
import { JobDescriptionPanel, emptyJobDescription } from '../../../components/forms/JobDescriptionPanel';
import { calculatePaye, retirementDate, HIGHEST_TAX_RATE, DEFAULT_PWD_EXEMPT_AMOUNT } from '../../../utils/tax';
import type { CustomFieldDefinition, CustomFieldType, EmployeeFieldGroup, JobDescription } from '../../../types';
import { PAY_BASIS_LABEL, nextStaffId, type EmployeeForm, type Errors, type StepId } from './wizardModel';

export interface StepProps {
  form: EmployeeForm;
  set: (patch: Partial<EmployeeForm>) => void;
  errors: Errors;
  showErrors: boolean;
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/* ------------------------------------------------------------------ */
/* Field primitives                                                    */
/* ------------------------------------------------------------------ */

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  hint?: string;
  span?: 1 | 2 | 4;
  min?: string;
  max?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ label, value, onChange, error, required, type = 'text', placeholder, hint, span = 1, min, max }) => (
  <label className={`req-field ew-span-${span}`}>
    <span>
      {label}
      {required && <em className="cs-req"> *</em>}
    </span>
    <input
      className={`form-control ${error ? 'is-invalid' : ''}`}
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={!!error}
    />
    {error ? <small className="ew-error">{error}</small> : hint ? <small className="ew-hint">{hint}</small> : null}
  </label>
);

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  error?: string;
  required?: boolean;
  placeholder?: string;
  span?: 1 | 2 | 4;
}

export const SelectField: React.FC<SelectFieldProps> = ({ label, value, onChange, options, error, required, placeholder = 'Select…', span = 1 }) => (
  <label className={`req-field ew-span-${span}`}>
    <span>
      {label}
      {required && <em className="cs-req"> *</em>}
    </span>
    <select className={`form-control ${error ? 'is-invalid' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
    {error && <small className="ew-error">{error}</small>}
  </label>
);

const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="ew-section-title">
    <h4>{children}</h4>
    {aside}
  </div>
);

/* ------------------------------------------------------------------ */
/* Quick-create panel for lookup lists                                 */
/* ------------------------------------------------------------------ */

interface QuickField {
  key: string;
  label: string;
  type?: 'text' | 'select';
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

const QuickCreate: React.FC<{
  title: string;
  fields: QuickField[];
  initial: Record<string, string>;
  note?: string;
  onSave: (v: Record<string, string>) => void;
  onCancel: () => void;
}> = ({ title, fields, initial, note, onSave, onCancel }) => {
  const [v, setV] = useState<Record<string, string>>(initial);
  const [tried, setTried] = useState(false);
  const missing = fields.filter((f) => f.required && !v[f.key]?.trim());
  const save = () => {
    setTried(true);
    if (missing.length === 0) onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])));
  };
  return (
    <div className="ew-quick" role="group" aria-label={title}>
      <div className="ew-quick-head">
        <strong>
          <Plus size={14} /> {title}
        </strong>
        <button type="button" className="req-icon-btn" onClick={onCancel} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <div className="ew-quick-grid">
        {fields.map((f) =>
          f.type === 'select' ? (
            <label key={f.key} className="req-field">
              <span>{f.label}</span>
              <select className="form-control" value={v[f.key] ?? ''} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))}>
                <option value="">Select…</option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ) : (
            <label key={f.key} className="req-field">
              <span>
                {f.label}
                {f.required && <em className="cs-req"> *</em>}
              </span>
              <input
                className={`form-control ${tried && f.required && !v[f.key]?.trim() ? 'is-invalid' : ''}`}
                value={v[f.key] ?? ''}
                placeholder={f.placeholder}
                autoFocus={f.key === fields[0].key}
                onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    save();
                  }
                }}
              />
            </label>
          )
        )}
      </div>
      {note && <p className="ew-hint">{note}</p>}
      <div className="ew-quick-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          <Check size={14} /> Save & select
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Custom fields                                                       */
/* ------------------------------------------------------------------ */

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown list' },
  { value: 'checkbox', label: 'Yes / No' }
];

export const GROUP_LABEL: Record<EmployeeFieldGroup, string> = {
  personal: 'Personal details',
  placement: 'Placement',
  contract: 'Contract',
  payment: 'Pay & payment',
  additional: 'Additional info'
};

const CustomFieldBuilder: React.FC<{ group: EmployeeFieldGroup; onSave: (f: Omit<CustomFieldDefinition, 'id'>) => void; onCancel: () => void }> = ({
  group,
  onSave,
  onCancel
}) => {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [targetGroup, setTargetGroup] = useState<EmployeeFieldGroup>(group);
  const [tried, setTried] = useState(false);
  const opts = options.split(',').map((o) => o.trim()).filter(Boolean);
  const valid = label.trim() && (type !== 'select' || opts.length >= 2);

  return (
    <div className="ew-quick ew-builder">
      <div className="ew-quick-head">
        <strong>
          <Settings2 size={14} /> New custom field
        </strong>
        <button type="button" className="req-icon-btn" onClick={onCancel} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
      <div className="ew-quick-grid">
        <label className="req-field">
          <span>
            Field name<em className="cs-req"> *</em>
          </span>
          <input className={`form-control ${tried && !label.trim() ? 'is-invalid' : ''}`} value={label} autoFocus placeholder="e.g. Driving licence number" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="req-field">
          <span>Type</span>
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Show in step</span>
          <select className="form-control" value={targetGroup} onChange={(e) => setTargetGroup(e.target.value as EmployeeFieldGroup)}>
            {(Object.keys(GROUP_LABEL) as EmployeeFieldGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        {type === 'select' && (
          <label className="req-field ew-quick-wide">
            <span>
              Choices (comma-separated)<em className="cs-req"> *</em>
            </span>
            <input
              className={`form-control ${tried && opts.length < 2 ? 'is-invalid' : ''}`}
              value={options}
              placeholder="e.g. Small, Medium, Large"
              onChange={(e) => setOptions(e.target.value)}
            />
          </label>
        )}
        <label className="req-field ew-quick-wide">
          <span>Help text (optional)</span>
          <input className="form-control" value={helpText} placeholder="Shown under the field" onChange={(e) => setHelpText(e.target.value)} />
        </label>
        <label className="ew-check">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span>Required for every new employee</span>
        </label>
      </div>
      <p className="ew-hint">The field is saved to your company's employee form and appears for all future employees.</p>
      <div className="ew-quick-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setTried(true);
            if (!valid) return;
            onSave({ label: label.trim(), type, group: targetGroup, required, options: type === 'select' ? opts : undefined, helpText: helpText.trim() || undefined });
          }}
        >
          <Check size={14} /> Add field
        </button>
      </div>
    </div>
  );
};

export const CustomFieldsBlock: React.FC<StepProps & { group: EmployeeFieldGroup; emptyText?: string }> = ({ form, set, errors, showErrors, group, emptyText }) => {
  const { customFields, addCustomField, removeCustomField } = useApp();
  const [building, setBuilding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fields = customFields.filter((f) => f.group === group);
  const setVal = (id: string, v: string | number | boolean) => set({ custom: { ...form.custom, [id]: v } });

  return (
    <div className="ew-custom">
      <SectionTitle
        aside={
          !building && (
            <button type="button" className="ew-link" onClick={() => setBuilding(true)}>
              <Plus size={13} /> Add custom field
            </button>
          )
        }
      >
        Custom fields
      </SectionTitle>

      {fields.length === 0 && !building && <p className="ew-hint">{emptyText ?? 'No custom fields in this step yet.'}</p>}

      {fields.length > 0 && (
        <div className="ew-grid">
          {fields.map((f) => {
            const err = showErrors ? errors[`cf:${f.id}`] : undefined;
            const v = form.custom[f.id];
            const removeBtn = (
              <span className="ew-cf-tools">
                {confirmRemove === f.id ? (
                  <>
                    <button type="button" className="ew-link danger" onClick={() => removeCustomField(f.id)}>
                      Remove field
                    </button>
                    <button type="button" className="ew-link" onClick={() => setConfirmRemove(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="req-icon-btn" title="Remove this custom field from the form" onClick={() => setConfirmRemove(f.id)} aria-label={`Remove ${f.label}`}>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            );
            return (
              <div key={f.id} className={`ew-cf ${f.type === 'textarea' ? 'ew-span-2' : ''}`}>
                {f.type === 'checkbox' ? (
                  <label className="ew-check ew-cf-check">
                    <input type="checkbox" checked={v === true} onChange={(e) => setVal(f.id, e.target.checked)} />
                    <span>
                      {f.label}
                      {f.required && <em className="cs-req"> *</em>}
                    </span>
                  </label>
                ) : (
                  <label className="req-field">
                    <span>
                      {f.label}
                      {f.required && <em className="cs-req"> *</em>}
                      <span className="ew-cf-badge">Custom</span>
                    </span>
                    {f.type === 'select' ? (
                      <select className={`form-control ${err ? 'is-invalid' : ''}`} value={String(v ?? '')} onChange={(e) => setVal(f.id, e.target.value)}>
                        <option value="">Select…</option>
                        {f.options?.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea className={`form-control ${err ? 'is-invalid' : ''}`} rows={2} value={String(v ?? '')} onChange={(e) => setVal(f.id, e.target.value)} />
                    ) : (
                      <input
                        className={`form-control ${err ? 'is-invalid' : ''}`}
                        type={f.type}
                        value={String(v ?? '')}
                        onChange={(e) => setVal(f.id, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                      />
                    )}
                  </label>
                )}
                {err ? <small className="ew-error">{err}</small> : f.helpText ? <small className="ew-hint">{f.helpText}</small> : null}
                {removeBtn}
              </div>
            );
          })}
        </div>
      )}

      {building && (
        <CustomFieldBuilder
          group={group}
          onCancel={() => setBuilding(false)}
          onSave={(f) => {
            addCustomField(f);
            setBuilding(false);
          }}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Step 1: Personal                                                    */
/* ------------------------------------------------------------------ */

export const PersonalStep: React.FC<StepProps> = (p) => {
  const { form, set, errors, showErrors } = p;
  const e = (k: string) => (showErrors ? errors[k] : undefined);
  const maxDob = new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()).toISOString().slice(0, 10);
  return (
    <>
      <SectionTitle>Name & identity</SectionTitle>
      <div className="ew-grid">
        <TextField label="First name" required value={form.firstName} onChange={(v) => set({ firstName: v })} error={e('firstName')} />
        <TextField label="Middle name" value={form.middleName} onChange={(v) => set({ middleName: v })} />
        <TextField label="Last name" required value={form.lastName} onChange={(v) => set({ lastName: v })} error={e('lastName')} />
        <SelectField label="Gender" required value={form.gender} onChange={(v) => set({ gender: v as EmployeeForm['gender'] })} options={['Female', 'Male', 'Other']} error={e('gender')} />
        <TextField label="Date of birth" required type="date" max={maxDob} value={form.dateOfBirth} onChange={(v) => set({ dateOfBirth: v })} error={e('dateOfBirth')} />
        <TextField label="National ID / passport" required value={form.nationalId} onChange={(v) => set({ nationalId: v })} error={e('nationalId')} />
        <SelectField label="Marital status" value={form.maritalStatus} onChange={(v) => set({ maritalStatus: v })} options={['Single', 'Married', 'Divorced', 'Widowed']} />
      </div>

      <SectionTitle>Statutory numbers</SectionTitle>
      <div className="ew-grid">
        <TextField label="KRA PIN" value={form.kraPin} placeholder="A123456789B" onChange={(v) => set({ kraPin: v.toUpperCase() })} error={e('kraPin')} hint="Can be added later" />
        <TextField label="NSSF number" value={form.nssfNo} onChange={(v) => set({ nssfNo: v })} hint="Can be added later" />
        <TextField label="SHIF number" value={form.shifNo} onChange={(v) => set({ shifNo: v })} hint="Can be added later" />
      </div>

      <SectionTitle>Contact & next of kin</SectionTitle>
      <div className="ew-grid">
        <TextField label="Mobile number" required type="tel" placeholder="+254 712 345 678" value={form.phone} onChange={(v) => set({ phone: v })} error={e('phone')} />
        <TextField label="Personal email" type="email" value={form.personalEmail} onChange={(v) => set({ personalEmail: v })} error={e('personalEmail')} />
        <TextField label="Home address" span={2} value={form.address} onChange={(v) => set({ address: v })} />
        <TextField label="Next of kin" value={form.kinName} onChange={(v) => set({ kinName: v })} />
        <TextField label="Relationship" value={form.kinRelationship} onChange={(v) => set({ kinRelationship: v })} />
        <TextField label="Next of kin phone" type="tel" value={form.kinPhone} onChange={(v) => set({ kinPhone: v })} error={e('kinPhone')} />
      </div>
      {errors.phoneWarn && (
        <div className="ew-warn">
          <AlertTriangle size={14} /> {errors.phoneWarn}
        </div>
      )}

      <CustomFieldsBlock {...p} group="personal" />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Step 2: Placement                                                   */
/* ------------------------------------------------------------------ */

type Creating = { kind: 'branch' | 'station' | 'department' | 'section' | 'designation'; name: string } | null;

export const PlacementStep: React.FC<StepProps> = (p) => {
  const { form, set, errors, showErrors } = p;
  const { orgStructure: org, addBranch, addStation, addDepartment, addSection, addDesignation, updateDesignation, tenantEmployees, addToast } = useApp();
  const [creating, setCreating] = useState<Creating>(null);
  const [editingJd, setEditingJd] = useState(false);
  const [jdDraft, setJdDraft] = useState<JobDescription | undefined>();
  const e = (k: string) => (showErrors ? errors[k] : undefined);

  const stations = org.stations.filter((s) => s.branchId === form.branchId);
  const sections = org.sections.filter((s) => s.departmentId === form.departmentId);
  const designation = org.designations.find((d) => d.id === form.designationId);
  const dept = org.departments.find((d) => d.id === form.departmentId);
  const nextCostCenter = useMemo(() => {
    const max = org.departments.reduce((m, d) => Math.max(m, Number(d.costCenter.replace(/\D/g, '')) || 0), 0);
    return `CC-${String(Math.ceil((max + 1) / 100) * 100).padStart(3, '0')}`;
  }, [org.departments]);

  // Designations in the chosen department first, then the rest
  const designationOptions = [...org.designations]
    .sort((a, b) => Number(b.departmentId === form.departmentId) - Number(a.departmentId === form.departmentId) || a.title.localeCompare(b.title))
    .map((d) => ({
      value: d.id,
      label: d.title,
      hint: [d.grade?.split(' ')[0], org.departments.find((x) => x.id === d.departmentId)?.name, d.jobDescription ? 'JD set' : undefined].filter(Boolean).join(' · ')
    }));

  const created = (what: string, name: string) => addToast({ type: 'success', title: `${what} added`, message: `“${name}” is now available in every form.` });

  const quick = () => {
    if (!creating) return null;
    const cancel = () => setCreating(null);
    switch (creating.kind) {
      case 'branch':
        return (
          <QuickCreate
            title="New branch"
            initial={{ name: creating.name, location: '' }}
            fields={[
              { key: 'name', label: 'Branch name', required: true },
              { key: 'location', label: 'Location / town', placeholder: 'e.g. Mombasa' }
            ]}
            onCancel={cancel}
            onSave={(v) => {
              const b = addBranch({ name: v.name, location: v.location || undefined });
              set({ branchId: b.id, stationId: '' });
              created('Branch', b.name);
              cancel();
            }}
          />
        );
      case 'station':
        return (
          <QuickCreate
            title={`New station in ${org.branches.find((b) => b.id === form.branchId)?.name}`}
            initial={{ name: creating.name }}
            fields={[{ key: 'name', label: 'Station / site name', required: true }]}
            onCancel={cancel}
            onSave={(v) => {
              const s = addStation({ name: v.name, branchId: form.branchId });
              set({ stationId: s.id });
              created('Station', s.name);
              cancel();
            }}
          />
        );
      case 'department':
        return (
          <QuickCreate
            title="New department / cost centre"
            initial={{ name: creating.name, costCenter: nextCostCenter }}
            fields={[
              { key: 'name', label: 'Department name', required: true },
              { key: 'costCenter', label: 'Cost centre code', required: true, placeholder: nextCostCenter }
            ]}
            note="The cost centre is used to post this department's payroll costs to the general ledger."
            onCancel={cancel}
            onSave={(v) => {
              const d = addDepartment({ name: v.name, costCenter: v.costCenter.toUpperCase() });
              set({ departmentId: d.id, sectionId: '' });
              created('Department', d.name);
              cancel();
            }}
          />
        );
      case 'section':
        return (
          <QuickCreate
            title={`New section in ${dept?.name}`}
            initial={{ name: creating.name }}
            fields={[{ key: 'name', label: 'Section / unit name', required: true }]}
            onCancel={cancel}
            onSave={(v) => {
              const s = addSection({ name: v.name, departmentId: form.departmentId });
              set({ sectionId: s.id });
              created('Section', s.name);
              cancel();
            }}
          />
        );
      case 'designation':
        return (
          <QuickCreate
            title="New designation"
            initial={{ title: creating.name, grade: '' }}
            fields={[
              { key: 'title', label: 'Designation / job title', required: true },
              { key: 'grade', label: 'Job grade', type: 'select', options: GRADE_SCALES }
            ]}
            note={dept ? `It will be linked to ${dept.name}. You can add its job description next.` : 'You can add its job description next.'}
            onCancel={cancel}
            onSave={(v) => {
              const d = addDesignation({ title: v.title, grade: v.grade || undefined, departmentId: form.departmentId || undefined });
              set({ designationId: d.id });
              created('Designation', d.title);
              cancel();
            }}
          />
        );
    }
  };

  return (
    <>
      <SectionTitle>Where they work</SectionTitle>
      <div className="ew-grid ew-grid-2">
        <CreatableSelect
          label="Branch"
          required
          entityName="branch"
          value={form.branchId}
          invalid={!!e('branchId')}
          options={org.branches.map((b) => ({ value: b.id, label: b.name, hint: b.location }))}
          onChange={(v) => set({ branchId: v, stationId: '' })}
          onCreateRequest={(q) => setCreating({ kind: 'branch', name: q })}
        />
        <CreatableSelect
          label="Station / site"
          entityName="station"
          value={form.stationId}
          allowClear
          disabled={!form.branchId}
          disabledHint="Choose a branch first"
          options={stations.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => set({ stationId: v })}
          onCreateRequest={(q) => setCreating({ kind: 'station', name: q })}
        />
      </div>
      {e('branchId') && <small className="ew-error">{e('branchId')}</small>}
      {(creating?.kind === 'branch' || creating?.kind === 'station') && quick()}

      <SectionTitle>Department & role</SectionTitle>
      <div className="ew-grid ew-grid-2">
        <CreatableSelect
          label="Department / cost centre"
          required
          entityName="department"
          value={form.departmentId}
          invalid={!!e('departmentId')}
          options={org.departments.map((d) => ({ value: d.id, label: d.name, hint: d.costCenter }))}
          onChange={(v) => set({ departmentId: v, sectionId: '' })}
          onCreateRequest={(q) => setCreating({ kind: 'department', name: q })}
        />
        <CreatableSelect
          label="Section / unit"
          entityName="section"
          value={form.sectionId}
          allowClear
          disabled={!form.departmentId}
          disabledHint="Choose a department first"
          options={sections.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => set({ sectionId: v })}
          onCreateRequest={(q) => setCreating({ kind: 'section', name: q })}
        />
      </div>
      {(creating?.kind === 'department' || creating?.kind === 'section') && quick()}

      <div className="ew-grid ew-grid-2">
        <CreatableSelect
          label="Designation"
          required
          entityName="designation"
          value={form.designationId}
          invalid={!!e('designationId')}
          options={designationOptions}
          onChange={(v) => {
            set({ designationId: v });
            setEditingJd(false);
          }}
          onCreateRequest={(q) => setCreating({ kind: 'designation', name: q })}
        />
        <CreatableSelect
          label="Reports to"
          entityName="manager"
          value={form.reportsToStaffId}
          allowClear
          options={tenantEmployees.map((x) => ({ value: x.staffId, label: x.fullName, hint: `${x.jobTitle} · ${x.staffId}` }))}
          onChange={(v) => set({ reportsToStaffId: v })}
        />
      </div>
      {(e('departmentId') || e('designationId')) && <small className="ew-error">{e('departmentId') ?? e('designationId')}</small>}
      {creating?.kind === 'designation' && quick()}

      {dept && (
        <p className="ew-hint ew-cc">
          <Building2 size={13} /> Payroll costs post to cost centre <b>{dept.costCenter}</b>
        </p>
      )}

      {/* Job description from designation */}
      {designation && (
        <div className="ew-jd">
          <div className="ew-jd-head">
            <span className="ew-jd-icon">
              <FileText size={16} />
            </span>
            <div>
              <strong>Job description — {designation.title}</strong>
              <span>{designation.grade ?? 'No grade set'} · shared by everyone in this designation</span>
            </div>
            {!editingJd && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setJdDraft(designation.jobDescription ?? emptyJobDescription());
                  setEditingJd(true);
                }}
              >
                {designation.jobDescription ? (
                  <>
                    <Pencil size={13} /> Edit
                  </>
                ) : (
                  <>
                    <Plus size={13} /> Add job description
                  </>
                )}
              </button>
            )}
          </div>

          {editingJd ? (
            <>
              <JobDescriptionPanel value={jdDraft} positionTitle={designation.title} onChange={setJdDraft} />
              <div className="ew-quick-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingJd(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    updateDesignation(designation.id, { jobDescription: jdDraft });
                    setEditingJd(false);
                    addToast({ type: 'success', title: 'Job description saved', message: `Saved to the ${designation.title} designation.` });
                  }}
                >
                  <Check size={14} /> Save to designation
                </button>
              </div>
            </>
          ) : designation.jobDescription ? (
            <div className="ew-jd-body">
              {designation.jobDescription.jobPurpose && <p>{designation.jobDescription.jobPurpose}</p>}
              {designation.jobDescription.responsibilities.length > 0 && (
                <ul>
                  {designation.jobDescription.responsibilities.slice(0, 5).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <div className="ew-jd-meta">
                {designation.jobDescription.educationLevel && <span>{designation.jobDescription.educationLevel}</span>}
                <span>{designation.jobDescription.minExperienceYears}+ yrs experience</span>
                {designation.jobDescription.reportsTo && <span>Reports to {designation.jobDescription.reportsTo}</span>}
                {designation.jobDescription.skills.slice(0, 4).map((s) => (
                  <span key={s} className="ew-skill">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="ew-hint ew-jd-empty">
              <Info size={13} /> No job description is set for this designation yet. Adding one here saves it for everyone in the role.
            </p>
          )}
        </div>
      )}

      <CustomFieldsBlock {...p} group="placement" />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Step 3: Contract                                                    */
/* ------------------------------------------------------------------ */

export const ContractStep: React.FC<StepProps> = (p) => {
  const { form, set, errors, showErrors } = p;
  const { hrEmployees } = useApp();
  const e = (k: string) => (showErrors ? errors[k] : undefined);
  const ct = CONTRACT_TYPES.find((c) => c.name === form.contractType);

  return (
    <>
      <SectionTitle>Contract type</SectionTitle>
      <div className="ew-ct-grid" role="radiogroup" aria-label="Contract type">
        {CONTRACT_TYPES.map((c) => (
          <button
            type="button"
            role="radio"
            aria-checked={form.contractType === c.name}
            key={c.id}
            className={`ew-ct ${form.contractType === c.name ? 'active' : ''}`}
            onClick={() => set({ contractType: c.name, endDate: c.hasEndDate ? form.endDate : '' })}
          >
            <strong>{c.name}</strong>
            <span>{PAY_BASIS_LABEL[c.payBasis].field} · paid {c.payFrequency.toLowerCase()}</span>
            <span>{c.hasEndDate ? 'Has an end date' : 'Open-ended'}{c.serviceThresholdDays ? ` · ${c.serviceThresholdDays}-day service threshold` : ''}</span>
          </button>
        ))}
      </div>
      {e('contractType') && <small className="ew-error">{e('contractType')}</small>}

      <SectionTitle>Terms</SectionTitle>
      <div className="ew-grid">
        <label className="req-field">
          <span>
            Staff ID<em className="cs-req"> *</em>
          </span>
          <div className="ew-inline">
            <input className={`form-control ${e('staffId') ? 'is-invalid' : ''}`} value={form.staffId} onChange={(ev) => set({ staffId: ev.target.value.toUpperCase() })} />
            <button type="button" className="req-icon-btn" title="Generate next staff ID" aria-label="Generate next staff ID" onClick={() => set({ staffId: nextStaffId(hrEmployees) })}>
              <RefreshCw size={14} />
            </button>
          </div>
          {e('staffId') ? <small className="ew-error">{e('staffId')}</small> : <small className="ew-hint">Auto-generated — you can change it</small>}
        </label>
        <TextField label="Start date" required type="date" value={form.startDate} onChange={(v) => set({ startDate: v })} error={e('startDate')} />
        {ct && !ct.hasEndDate ? (
          <TextField
            label="Retirement age"
            required
            type="number"
            min="50"
            max="75"
            value={form.retirementAge}
            onChange={(v) => set({ retirementAge: v })}
            error={e('retirementAge')}
          />
        ) : (
          <TextField label="End date" required={!!ct?.hasEndDate} type="date" min={form.startDate} value={form.endDate} onChange={(v) => set({ endDate: v })} error={e('endDate')} />
        )}
        <SelectField label="Probation" value={form.probationMonths} onChange={(v) => set({ probationMonths: v })} options={Array.from(new Set(['0', '1', '3', '6', '12', form.probationMonths].filter(Boolean))).sort((x, y) => Number(x) - Number(y))} placeholder="None" />
        <TextField label="Notice period (days)" type="number" value={form.noticeDays} onChange={(v) => set({ noticeDays: v })} />
        <TextField label="Work schedule" span={2} value={form.workSchedule} onChange={(v) => set({ workSchedule: v })} placeholder="e.g. Mon–Fri, 8:00–17:00 or Shift work" />
      </div>

      {ct && !ct.hasEndDate && (
        <div className="ew-callout info">
          <CalendarClock size={16} />
          <div>
            <strong>No employment end date — this is an open-ended contract</strong>
            <span>
              {retirementDate(form.dateOfBirth, Number(form.retirementAge))
                ? `Employment continues until retirement on ${new Date(retirementDate(form.dateOfBirth, Number(form.retirementAge)) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} (age ${form.retirementAge}), unless ended earlier by resignation or termination.`
                : 'Employment continues until the employee reaches retirement age. Add a date of birth in step 1 to see the retirement date.'}
            </span>
          </div>
        </div>
      )}

      <SectionTitle>Leave entitlement</SectionTitle>
      <div className="ew-grid">
        <TextField
          label="Annual leave (working days / year)"
          required
          type="number"
          min="0"
          max="60"
          value={form.leaveAnnualDays}
          onChange={(v) => set({ leaveAnnualDays: v })}
          error={e('leaveAnnualDays')}
          hint={`${(Number(form.leaveAnnualDays || 0) / 12).toFixed(2)} days accrue per month`}
        />
        <label className="req-field">
          <span>How leave is credited</span>
          <select className="form-control" value={form.leaveAccrual} onChange={(ev) => set({ leaveAccrual: ev.target.value as EmployeeForm['leaveAccrual'] })}>
            <option value="MONTHLY">Accrues monthly</option>
            <option value="UPFRONT">Full entitlement at start of year</option>
          </select>
        </label>
        <label className="ew-check ew-span-2 ew-check-field">
          <input type="checkbox" checked={form.leaveDuringProbation} onChange={(ev) => set({ leaveDuringProbation: ev.target.checked })} />
          <span>Can take annual leave during probation</span>
        </label>
      </div>
      {errors.leaveAnnualDaysWarn && (
        <div className="ew-warn">
          <AlertTriangle size={14} /> {errors.leaveAnnualDaysWarn}
        </div>
      )}

      <CustomFieldsBlock {...p} group="contract" />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Step 4: Payment                                                     */
/* ------------------------------------------------------------------ */

export const PaymentStep: React.FC<StepProps> = (p) => {
  const { form, set, errors, showErrors } = p;
  const [banks, setBanks] = useState(KENYAN_BANKS);
  const e = (k: string) => (showErrors ? errors[k] : undefined);
  const ct = CONTRACT_TYPES.find((c) => c.name === form.contractType);
  const basis = ct ? PAY_BASIS_LABEL[ct.payBasis] : PAY_BASIS_LABEL.MONTHLY_SALARY;
  const allowanceTotal = form.allowances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const rate = Number(form.payRate) || 0;
  const monthly = ct?.payBasis === 'MONTHLY_SALARY' || !ct;
  const taxProfile = {
    employment: form.taxEmployment,
    pwdExempt: form.pwdExempt,
    pwdExemptAmount: Number(form.pwdExemptAmount) || DEFAULT_PWD_EXEMPT_AMOUNT,
    taxExempt: form.taxExempt
  };
  const est = monthly && rate > 0 ? calculatePaye(rate + allowanceTotal, taxProfile) : null;

  const setAllowance = (i: number, patch: Partial<{ label: string; amount: string }>) =>
    set({ allowances: form.allowances.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <>
      <SectionTitle>Pay</SectionTitle>
      <div className="ew-grid">
        <TextField label={basis.field} required type="number" min="0" value={form.payRate} onChange={(v) => set({ payRate: v })} error={e('payRate')} hint={basis.unit} />
      </div>

      <SectionTitle
        aside={
          <button type="button" className="ew-link" onClick={() => set({ allowances: [...form.allowances, { label: '', amount: '' }] })}>
            <Plus size={13} /> Add allowance
          </button>
        }
      >
        Allowances
      </SectionTitle>
      {form.allowances.length === 0 ? (
        <div className="ew-chips">
          {['House allowance', 'Transport allowance', 'Airtime allowance'].map((l) => (
            <button type="button" key={l} className="ew-chip" onClick={() => set({ allowances: [...form.allowances, { label: l, amount: '' }] })}>
              <Plus size={12} /> {l}
            </button>
          ))}
        </div>
      ) : (
        <div className="ew-allowances">
          {form.allowances.map((a, i) => (
            <div key={i} className="ew-allowance">
              <input className="form-control" placeholder="Allowance name" value={a.label} onChange={(ev) => setAllowance(i, { label: ev.target.value })} />
              <input className="form-control" type="number" min="0" placeholder="KES / month" value={a.amount} onChange={(ev) => setAllowance(i, { amount: ev.target.value })} />
              <button type="button" className="req-icon-btn danger" aria-label="Remove allowance" onClick={() => set({ allowances: form.allowances.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
              {showErrors && errors[`allow:${i}`] && <small className="ew-error">{errors[`allow:${i}`]}</small>}
            </div>
          ))}
        </div>
      )}

      <SectionTitle>Tax settings</SectionTitle>
      <div className="ew-method" role="radiogroup" aria-label="Employment for tax purposes">
        <button type="button" role="radio" aria-checked={form.taxEmployment === 'PRIMARY'} className={form.taxEmployment === 'PRIMARY' ? 'active' : ''} onClick={() => set({ taxEmployment: 'PRIMARY' })}>
          Primary employment
        </button>
        <button type="button" role="radio" aria-checked={form.taxEmployment === 'SECONDARY'} className={form.taxEmployment === 'SECONDARY' ? 'active' : ''} onClick={() => set({ taxEmployment: 'SECONDARY' })}>
          Secondary employment
        </button>
      </div>
      {form.taxEmployment === 'SECONDARY' ? (
        <div className="ew-callout warn">
          <AlertTriangle size={16} />
          <div>
            <strong>Taxed at the highest bracket ({HIGHEST_TAX_RATE * 100}%)</strong>
            <span>
              This is not the employee's main job, so all taxable pay is taxed at the top PAYE rate and personal relief is not given. Personal relief is claimed only through the primary employer.
            </span>
          </div>
        </div>
      ) : (
        <p className="ew-hint">Main employer — graduated PAYE bands apply and monthly personal relief is given.</p>
      )}

      <div className="ew-tax-options">
        <label className={`ew-option ${form.pwdExempt ? 'on' : ''}`}>
          <input type="checkbox" checked={form.pwdExempt} onChange={(ev) => set({ pwdExempt: ev.target.checked })} />
          <Accessibility size={18} />
          <span>
            <b>Person with disability exemption</b>
            <small>Employee holds a valid tax exemption certificate for persons with disability</small>
          </span>
        </label>
        <label className={`ew-option ${form.taxExempt ? 'on danger' : ''}`}>
          <input type="checkbox" checked={form.taxExempt} onChange={(ev) => set({ taxExempt: ev.target.checked })} />
          <Ban size={18} />
          <span>
            <b>Zero tax (pay without PAYE)</b>
            <small>No PAYE is deducted at all — use only with supporting documents</small>
          </span>
        </label>
      </div>

      {form.pwdExempt && (
        <div className={`ew-subpanel ${form.taxExempt ? 'muted' : ''}`}>
          <div className="ew-grid">
            <TextField label="Exemption certificate no." required value={form.pwdCertificateNo} onChange={(v) => set({ pwdCertificateNo: v })} error={e('pwdCertificateNo')} />
            <TextField
              label="Certificate expiry"
              required
              type="date"
              value={form.pwdCertificateExpiry}
              onChange={(v) => set({ pwdCertificateExpiry: v })}
              error={e('pwdCertificateExpiry')}
            />
            <TextField
              label="Exempt amount (KES / month)"
              required
              type="number"
              min="0"
              value={form.pwdExemptAmount}
              onChange={(v) => set({ pwdExemptAmount: v })}
              error={e('pwdExemptAmount')}
              hint={`Standard exemption is KES ${DEFAULT_PWD_EXEMPT_AMOUNT.toLocaleString()}; taxable pay above it is taxed normally`}
              span={2}
            />
          </div>
        </div>
      )}

      {form.taxExempt && (
        <div className="ew-subpanel danger">
          <div className="ew-grid">
            <SelectField
              label="Reason for zero tax"
              required
              span={2}
              value={form.taxExemptReason}
              onChange={(v) => set({ taxExemptReason: v })}
              error={e('taxExemptReason')}
              options={['Income below taxable threshold', 'Diplomatic or treaty exemption', 'KRA exemption certificate', 'Court order or KRA directive', 'Other approved exemption']}
            />
          </div>
          <p className="ew-hint">
            <AlertTriangle size={12} /> No PAYE will be deducted for this employee
            {form.pwdExempt || form.taxEmployment === 'SECONDARY' ? '; this overrides the secondary-employment and disability settings' : ''}. Keep the approval on file for audit.
          </p>
        </div>
      )}

      {est && (
        <>
          <div className="ew-estimate">
            <div>
              <span>Gross</span>
              <b>{kes(est.gross)}</b>
            </div>
            <div>
              <span>Chargeable</span>
              <b>{kes(est.chargeable)}</b>
            </div>
            <div className={est.method === 'ZERO' ? 'ew-estimate-zero' : ''}>
              <span>PAYE</span>
              <b>{kes(est.paye)}</b>
            </div>
            <div>
              <span>NSSF</span>
              <b>{form.statutory.nssf ? kes(est.nssf) : '—'}</b>
            </div>
            <div>
              <span>SHIF + Levy</span>
              <b>{kes((form.statutory.shif ? est.shif : 0) + (form.statutory.ahl ? est.ahl : 0))}</b>
            </div>
            <div className="ew-estimate-net">
              <span>Est. net pay</span>
              <b>
                {kes(est.gross - est.paye - (form.statutory.nssf ? est.nssf : 0) - (form.statutory.shif ? est.shif : 0) - (form.statutory.ahl ? est.ahl : 0))}
              </b>
            </div>
          </div>
          <p className="ew-hint ew-estimate-note">
            <Info size={12} /> {est.note}
            {est.exemptIncome > 0 && est.method !== 'ZERO' ? ` · KES ${Math.round(est.exemptIncome).toLocaleString()} exempt this month` : ''}
            {est.relief > 0 ? ` · personal relief KES ${est.relief.toLocaleString()}` : ''}
          </p>
        </>
      )}

      <SectionTitle>Statutory deductions</SectionTitle>
      <div className="ew-toggles">
        {(
          [
            ['nssf', 'NSSF'],
            ['shif', 'SHIF'],
            ['ahl', 'Housing levy']
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="ew-check">
            <input type="checkbox" checked={form.statutory[k]} onChange={(ev) => set({ statutory: { ...form.statutory, [k]: ev.target.checked } })} />
            <span>{l}</span>
          </label>
        ))}
      </div>

      <SectionTitle>Payment method</SectionTitle>
      <div className="ew-method" role="radiogroup" aria-label="Payment method">
        <button type="button" role="radio" aria-checked={form.paymentMethod === 'BANK'} className={form.paymentMethod === 'BANK' ? 'active' : ''} onClick={() => set({ paymentMethod: 'BANK' })}>
          <Building2 size={16} /> Bank transfer
        </button>
        <button type="button" role="radio" aria-checked={form.paymentMethod === 'MPESA'} className={form.paymentMethod === 'MPESA' ? 'active' : ''} onClick={() => set({ paymentMethod: 'MPESA' })}>
          <Smartphone size={16} /> M-Pesa
        </button>
      </div>
      {form.paymentMethod === 'BANK' ? (
        <div className="ew-grid">
          <CreatableSelect
            label="Bank"
            required
            entityName="bank"
            value={form.bankName}
            invalid={!!e('bankName')}
            options={banks.map((b) => ({ value: b, label: b }))}
            onChange={(v) => set({ bankName: v })}
            onCreateRequest={(q) => {
              if (!q) return;
              setBanks((b) => [...b, q]);
              set({ bankName: q });
            }}
          />
          <TextField label="Bank branch" value={form.bankBranch} onChange={(v) => set({ bankBranch: v })} />
          <TextField label="Account number" required value={form.bankAccount} onChange={(v) => set({ bankAccount: v })} error={e('bankAccount') ?? e('bankName')} span={2} />
        </div>
      ) : (
        <div className="ew-grid">
          <TextField label="M-Pesa number" required type="tel" placeholder="0712 345 678" value={form.mpesaNumber} onChange={(v) => set({ mpesaNumber: v })} error={e('mpesaNumber')} />
        </div>
      )}

      <CustomFieldsBlock {...p} group="payment" />
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Step 5: Additional                                                  */
/* ------------------------------------------------------------------ */

export const AdditionalStep: React.FC<StepProps> = (p) => {
  const { customFields } = useApp();
  const elsewhere = customFields.filter((f) => f.group !== 'additional');
  return (
    <>
      <p className="ew-intro">
        Capture anything your company needs that isn't in the standard form. Fields you add here are saved for every future employee, and you can choose which step they appear in.
      </p>
      <CustomFieldsBlock {...p} group="additional" emptyText="No additional fields yet — use “Add custom field” to create one." />
      {elsewhere.length > 0 && (
        <div className="ew-elsewhere">
          <SectionTitle>Custom fields in other steps</SectionTitle>
          <ul>
            {elsewhere.map((f) => (
              <li key={f.id}>
                <b>{f.label}</b> — {GROUP_LABEL[f.group]}
                {f.required ? ' · required' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Step 6: Review                                                      */
/* ------------------------------------------------------------------ */

export const ReviewStep: React.FC<{ form: EmployeeForm; goTo: (s: StepId) => void }> = ({ form, goTo }) => {
  const { orgStructure: org, customFields, tenantEmployees } = useApp();
  const name = (list: { id: string; name?: string; title?: string }[], id: string) => {
    const x = list.find((i) => i.id === id);
    return x ? x.name ?? x.title ?? '' : '';
  };
  const dept = org.departments.find((d) => d.id === form.departmentId);
  const ct = CONTRACT_TYPES.find((c) => c.name === form.contractType);
  const cfValue = (id: string) => {
    const v = form.custom[id];
    if (customFields.find((f) => f.id === id)?.type === 'checkbox') return v === true ? 'Yes' : 'No';
    return v === undefined || v === '' ? '—' : String(v);
  };

  const block = (step: StepId, title: string, rows: [string, string | undefined][]) => (
    <section className="ew-review-block">
      <header>
        <h4>{title}</h4>
        <button type="button" className="ew-link" onClick={() => goTo(step)}>
          <Pencil size={12} /> Edit
        </button>
      </header>
      <dl>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v && String(v).trim() ? v : '—'}</dd>
          </React.Fragment>
        ))}
        {customFields
          .filter((f) => f.group === step)
          .map((f) => (
            <React.Fragment key={f.id}>
              <dt>{f.label}</dt>
              <dd>{cfValue(f.id)}</dd>
            </React.Fragment>
          ))}
      </dl>
    </section>
  );

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
  return (
    <div className="ew-review">
      <div className="ew-review-hero">
        <span className="ew-avatar">{(form.firstName[0] ?? '') + (form.lastName[0] ?? '')}</span>
        <div>
          <strong>{fullName || 'New employee'}</strong>
          <span>
            {name(org.designations, form.designationId)} · {dept?.name} · {form.staffId}
          </span>
        </div>
      </div>
      <div className="ew-review-grid">
        {block('personal', 'Personal details', [
          ['Gender', form.gender],
          ['Date of birth', form.dateOfBirth],
          ['National ID', form.nationalId],
          ['KRA PIN', form.kraPin],
          ['Mobile', form.phone],
          ['Email', form.personalEmail],
          ['Next of kin', form.kinName ? `${form.kinName} (${form.kinRelationship || '—'}) ${form.kinPhone}` : '']
        ])}
        {block('placement', 'Placement', [
          ['Branch', name(org.branches, form.branchId)],
          ['Station', name(org.stations, form.stationId)],
          ['Department', dept ? `${dept.name} (${dept.costCenter})` : ''],
          ['Section', name(org.sections, form.sectionId)],
          ['Designation', name(org.designations, form.designationId)],
          ['Reports to', tenantEmployees.find((x) => x.staffId === form.reportsToStaffId)?.fullName]
        ])}
        {block('contract', 'Contract', [
          ['Contract type', form.contractType],
          ['Staff ID', form.staffId],
          ['Start', form.startDate],
          ct && !ct.hasEndDate
            ? ['End', `Retirement at ${form.retirementAge}${retirementDate(form.dateOfBirth, Number(form.retirementAge)) ? ` (${retirementDate(form.dateOfBirth, Number(form.retirementAge))})` : ''}`]
            : ['End', form.endDate],
          ['Annual leave', `${form.leaveAnnualDays} days · ${form.leaveAccrual === 'MONTHLY' ? 'monthly accrual' : 'credited upfront'}${form.leaveDuringProbation ? '' : ' · after probation'}`],
          ['Probation', form.probationMonths ? `${form.probationMonths} months` : 'None'],
          ['Notice', form.noticeDays ? `${form.noticeDays} days` : ''],
          ['Schedule', form.workSchedule]
        ])}
        {block('payment', 'Pay & payment', [
          [ct ? PAY_BASIS_LABEL[ct.payBasis].field : 'Pay', form.payRate ? `KES ${Number(form.payRate).toLocaleString()}` : ''],
          ['Allowances', form.allowances.map((a) => `${a.label} ${Number(a.amount).toLocaleString()}`).join(', ')],
          ['Paid via', form.paymentMethod === 'BANK' ? `${form.bankName} ${form.bankAccount}` : `M-Pesa ${form.mpesaNumber}`],
          ['Tax', form.taxExempt ? `Zero tax — ${form.taxExemptReason}` : `${form.taxEmployment === 'PRIMARY' ? 'Primary employment' : `Secondary employment (${HIGHEST_TAX_RATE * 100}%)`}${form.pwdExempt ? ` · PWD exemption KES ${Number(form.pwdExemptAmount).toLocaleString()} (cert ${form.pwdCertificateNo})` : ''}`],
          ['Other statutory', (['nssf', 'shif', 'ahl'] as const).filter((k) => form.statutory[k]).map((k) => k.toUpperCase()).join(', ')]
        ])}
        {customFields.some((f) => f.group === 'additional') && block('additional', 'Additional info', [])}
      </div>
    </div>
  );
};
