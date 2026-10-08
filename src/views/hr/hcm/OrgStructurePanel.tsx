import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { DataTable, Panel } from '../../../suites/ui/kit';
import type { OrgStructure } from '../../../types';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

type Key = keyof OrgStructure;
type Unit = { id: string; name?: string; title?: string; active?: boolean; parentId?: string; departmentId?: string; branchId?: string; costCenter?: string; headStaffId?: string; grade?: string; establishment?: number };

const KEYS: { key: Key; label: string }[] = [
  { key: 'branches', label: 'Branches' },
  { key: 'stations', label: 'Sites / stations' },
  { key: 'departments', label: 'Departments & divisions' },
  { key: 'sections', label: 'Sections' },
  { key: 'designations', label: 'Positions' }
];

/** Company setup › Organisation structure: maintain the selected company's branches, sites, departments (with parent division), sections and positions. */
export const OrgStructurePanel: React.FC = () => {
  const { orgStructure, updateOrgItem, removeOrgItem, addBranch, addStation, addDepartment, addSection, addDesignation, addToast, tenantEmployees, organizations, selectedOrgId } = useApp();
  const { canEdit } = useCanEdit();
  const { nameOf } = useStaff();
  const [key, setKey] = useState<Key>('departments');
  const [form, setForm] = useState({ name: '', parent: '', costCenter: '', head: '', grade: '', establishment: 1 });
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const rows = orgStructure[key] as unknown as Unit[];
  const depts = orgStructure.departments as unknown as Unit[];
  const nameOfUnit = (u: Unit) => u.name ?? u.title ?? u.id;
  const deptName = (id?: string) => depts.find((d) => d.id === id)?.name ?? '—';
  const filled = (id: string) => tenantEmployees.filter((e) => e.designationId === id && e.status !== 'TERMINATED').length;
  const company = organizations.find((o) => o.id === selectedOrgId)?.name ?? selectedOrgId;

  const add = () => {
    const name = form.name.trim();
    if (!name) return addToast({ type: 'error', title: 'Name required', message: 'Enter a name for the new unit.' });
    if (rows.some((u) => nameOfUnit(u).toLowerCase() === name.toLowerCase())) return addToast({ type: 'error', title: 'Duplicate', message: `${name} already exists in ${company}.` });
    if ((key === 'stations' || key === 'sections') && !form.parent) return addToast({ type: 'error', title: 'Parent required', message: key === 'stations' ? 'Choose the branch the site belongs to.' : 'Choose the department the section belongs to.' });
    if (key === 'designations' && form.establishment < 1) return addToast({ type: 'error', title: 'Check establishment', message: 'Approved posts must be at least 1.' });
    if (key === 'branches') addBranch({ name });
    if (key === 'stations') addStation({ name, branchId: form.parent });
    if (key === 'departments') addDepartment({ name, costCenter: form.costCenter.trim() || name.slice(0, 4).toUpperCase(), parentId: form.parent || undefined, headStaffId: form.head || undefined });
    if (key === 'sections') addSection({ name, departmentId: form.parent, headStaffId: form.head || undefined });
    if (key === 'designations') addDesignation({ title: name, grade: form.grade || undefined, departmentId: form.parent || undefined, establishment: form.establishment });
    addToast({ type: 'success', title: 'Unit added', message: `${name} added to ${company}.` });
    setForm({ name: '', parent: '', costCenter: '', head: '', grade: '', establishment: 1 });
  };

  const parentOptions: Unit[] = key === 'stations' ? (orgStructure.branches as unknown as Unit[]) : key === 'branches' ? [] : depts;

  return (
    <Panel title={`Organisation structure · ${company}`} subtitle="Each company keeps its own structure. Units with employees placed in them can be deactivated only after the staff are moved; units with children cannot be removed.">
      <Toolbar>
        <select className="form-control" style={{ width: 220 }} value={key} onChange={(e) => setKey(e.target.value as Key)} aria-label="Structure level">
          {KEYS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label} ({(orgStructure[k.key] as unknown[]).length})
            </option>
          ))}
        </select>
      </Toolbar>
      {canEdit && (
        <Toolbar>
          <input className="form-control" style={{ width: 200 }} placeholder={key === 'designations' ? 'Position title' : 'Name'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Unit name" />
          {key !== 'branches' && (
            <select className="form-control" style={{ width: 200 }} value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })} aria-label="Parent unit">
              <option value="">{key === 'departments' ? 'No parent (top division)' : key === 'designations' ? 'Any department' : 'Choose parent…'}</option>
              {parentOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {nameOfUnit(u)}
                </option>
              ))}
            </select>
          )}
          {key === 'departments' && <input className="form-control" style={{ width: 110 }} placeholder="Cost centre" value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })} />}
          {(key === 'departments' || key === 'sections') && <StaffSelect label="Head" allowEmpty="No head yet" value={form.head} onChange={(v) => setForm({ ...form, head: v })} />}
          {key === 'designations' && (
            <>
              <input className="form-control" style={{ width: 90 }} placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
              <input className="form-control" style={{ width: 80 }} type="number" value={form.establishment} onChange={(e) => setForm({ ...form, establishment: Number(e.target.value) })} aria-label="Approved posts" />
            </>
          )}
          <Btn primary onClick={add}>
            Add
          </Btn>
        </Toolbar>
      )}
      <DataTable
        rows={rows}
        rowKey={(u) => u.id}
        columns={[
          {
            key: 'n',
            header: 'Name',
            render: (u) =>
              edit?.id === u.id ? (
                <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="New name" />
              ) : (
                nameOfUnit(u)
              )
          },
          {
            key: 'p',
            header: key === 'stations' ? 'Branch' : key === 'departments' ? 'Reports to' : key === 'branches' ? 'Location' : 'Department',
            render: (u) => (key === 'stations' ? (orgStructure.branches.find((b) => b.id === u.branchId)?.name ?? '—') : key === 'departments' ? deptName(u.parentId) : key === 'branches' ? '—' : deptName(u.departmentId))
          },
          {
            key: 'x',
            header: key === 'designations' ? 'Grade · posts' : key === 'departments' ? 'Cost centre · head' : 'Head',
            render: (u) => (key === 'designations' ? `${u.grade ?? '—'} · ${filled(u.id)} of ${u.establishment ?? '—'} filled` : key === 'departments' ? `${u.costCenter ?? '—'} · ${u.headStaffId ? nameOf(u.headStaffId) : 'no head'}` : u.headStaffId ? nameOf(u.headStaffId) : '—')
          },
          { key: 's', header: 'Status', render: (u) => <StatusPill status={u.active === false ? 'CLOSED' : 'ACTIVE'} label={u.active === false ? 'inactive' : 'active'} /> },
          {
            key: 'a',
            header: '',
            render: (u) =>
              !canEdit ? null : edit?.id === u.id ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Btn primary onClick={() => updateOrgItem(key, u.id, key === 'designations' ? { title: edit.name } : { name: edit.name }) && setEdit(null)}>
                    Save
                  </Btn>
                  <Btn onClick={() => setEdit(null)}>Cancel</Btn>
                </span>
              ) : (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Btn onClick={() => setEdit({ id: u.id, name: nameOfUnit(u) })}>Rename</Btn>
                  <Btn onClick={() => updateOrgItem(key, u.id, { active: u.active === false })}>{u.active === false ? 'Reactivate' : 'Deactivate'}</Btn>
                  <Btn onClick={() => removeOrgItem(key, u.id)}>Remove</Btn>
                </span>
              )
          }
        ]}
      />
    </Panel>
  );
};
