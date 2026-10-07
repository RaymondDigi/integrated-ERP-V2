import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  KeyRound,
  Ban,
  Download,
  Plus,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { User } from '../types';

export const UsersView: React.FC = () => {
  const {
    users,
    setSelectedUser,
    suspendUser,
    resetUserMfa,
    addToast
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [mfaFilter, setMfaFilter] = useState('ALL');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<keyof User>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    email: true,
    org: true,
    role: true,
    status: true,
    mfa: true,
    lastLogin: true,
    created: true
  });
  const [showColumnToggle, setShowColumnToggle] = useState(false);

  const filteredUsers = users
    .filter((u) => {
      const matchesSearch =
        searchQuery === '' ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
      const matchesMfa =
        mfaFilter === 'ALL' ||
        (mfaFilter === 'ENFORCED' && u.mfa.startsWith('Enforced')) ||
        (mfaFilter === 'NOT_CONFIGURED' && u.mfa === 'Not Configured');

      return matchesSearch && matchesRole && matchesStatus && matchesMfa;
    })
    .sort((a, b) => {
      const valA = a[sortField] || '';
      const valB = b[sortField] || '';
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field: keyof User) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map((u) => u.id));
    }
  };

  const handleToggleUser = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Name,Email,Role,Organization,Status,MFA,Last Login']
        .concat(
          filteredUsers.map(
            (u) =>
              `"${u.name}","${u.email}","${u.role}","${u.organizationName}","${u.status}","${u.mfa}","${u.lastLogin}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `enterprise_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'info',
      title: 'Users Exported',
      message: `Exported ${filteredUsers.length} user records to CSV.`
    });
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Users & Identity Management</h1>
          <p className="view-subtitle">
            Enterprise RBAC/ABAC directory, credential lifecycles, active sessions, and multi-factor enforcement.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
            <Download size={14} /> Export CSV
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'User Invitation Modal',
                message: 'Enterprise SCIM directory provisioning workflow initiated.'
              })
            }
          >
            <Plus size={14} /> Provision User
          </button>
        </div>
      </div>

      {/* Advanced Data Table Container */}
      <div className="emc-table-card">
        {/* Toolbar */}
        <div className="emc-table-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <input
                type="text"
                className="table-search-input"
                style={{ width: '100%' }}
                placeholder="Search users by name, email, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="table-filter-group" style={{ flexWrap: 'wrap' }}>
              <select
                className="table-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by Role"
              >
                <option value="ALL">All Roles</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Organization Admin">Organization Admin</option>
                <option value="Security Officer">Security Officer</option>
                <option value="DevOps Lead">DevOps Lead</option>
                <option value="Compliance Auditor">Compliance Auditor</option>
                <option value="Analyst">Analyst</option>
              </select>

              <select
                className="table-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by Status"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Pending Invite">Pending Invite</option>
              </select>

              <select
                className="table-select"
                value={mfaFilter}
                onChange={(e) => setMfaFilter(e.target.value)}
                aria-label="Filter by MFA"
              >
                <option value="ALL">All MFA States</option>
                <option value="ENFORCED">MFA Enforced</option>
                <option value="NOT_CONFIGURED">MFA Missing (Risk)</option>
              </select>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowColumnToggle((prev) => !prev)}
            >
              <SlidersHorizontal size={14} /> Columns
            </button>

            {showColumnToggle && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 4,
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  padding: 10,
                  boxShadow: 'var(--shadow-md)',
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  width: 160
                }}
              >
                {Object.entries(visibleColumns).map(([key, isVis]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={isVis}
                      onChange={() =>
                        setVisibleColumns((prev: any) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                    <span style={{ textTransform: 'capitalize' }}>{key}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk Action Bar inside Table */}
        {selectedUserIds.length > 0 && (
          <div
            style={{
              padding: '6px 16px',
              background: 'var(--bg-active)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12
            }}
          >
            <span>
              <strong>{selectedUserIds.length}</strong> users selected
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-danger btn-xs"
                onClick={() => {
                  if (confirm(`Suspend ${selectedUserIds.length} users? All active sessions will be terminated.`)) {
                    selectedUserIds.forEach((id) => suspendUser(id));
                    setSelectedUserIds([]);
                  }
                }}
              >
                <Ban size={12} /> Bulk Suspend
              </button>
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  selectedUserIds.forEach((id) => resetUserMfa(id));
                  setSelectedUserIds([]);
                }}
              >
                <KeyRound size={12} /> Force MFA Reset
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setSelectedUserIds([])}>
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* Table Body */}
        <div className="emc-table-container">
          <table className="emc-table">
            <thead>
              <tr>
                <th className="emc-th" style={{ width: 40 }}>
                  <div onClick={handleSelectAll} style={{ cursor: 'pointer' }}>
                    {selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0 ? (
                      <CheckSquare size={14} color="var(--brand-primary)" />
                    ) : (
                      <Square size={14} />
                    )}
                  </div>
                </th>
                <th className="emc-th sortable" onClick={() => handleSort('name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>User</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                {visibleColumns.org && (
                  <th className="emc-th sortable" onClick={() => handleSort('organizationName')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>Organization</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                )}
                {visibleColumns.role && (
                  <th className="emc-th sortable" onClick={() => handleSort('role')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>Role</span>
                      <ArrowUpDown size={12} />
                    </div>
                  </th>
                )}
                {visibleColumns.status && <th className="emc-th">Status</th>}
                {visibleColumns.mfa && <th className="emc-th">MFA Policy</th>}
                {visibleColumns.lastLogin && <th className="emc-th">Last Login</th>}
                {visibleColumns.created && <th className="emc-th">Created</th>}
                <th className="emc-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <tr
                      key={user.id}
                      className={`emc-tr ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedUser(user)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="emc-td" onClick={(e) => handleToggleUser(user.id, e)}>
                        {isSelected ? (
                          <CheckSquare size={14} color="var(--brand-primary)" />
                        ) : (
                          <Square size={14} color="var(--text-secondary)" />
                        )}
                      </td>

                      <td className="emc-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 4,
                              background: '#237857',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 700
                            }}
                          >
                            {user.avatar}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {user.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {visibleColumns.org && (
                        <td className="emc-td">
                          <span style={{ color: 'var(--text-primary)' }}>{user.organizationName}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block' }}>
                            {user.department}
                          </span>
                        </td>
                      )}

                      {visibleColumns.role && (
                        <td className="emc-td">
                          <span
                            className={`badge ${
                              user.role === 'Super Admin'
                                ? 'badge-critical'
                                : user.role === 'Organization Admin'
                                ? 'badge-warning'
                                : 'badge-neutral'
                            }`}
                          >
                            {user.role}
                          </span>
                        </td>
                      )}

                      {visibleColumns.status && (
                        <td className="emc-td">
                          <span
                            className={`badge ${
                              user.status === 'Active'
                                ? 'badge-success'
                                : user.status === 'Suspended'
                                ? 'badge-critical'
                                : 'badge-warning'
                            }`}
                          >
                            ● {user.status}
                          </span>
                        </td>
                      )}

                      {visibleColumns.mfa && (
                        <td className="emc-td">
                          <span
                            className={`badge ${
                              user.mfa.startsWith('Enforced')
                                ? 'badge-success'
                                : user.mfa === 'Not Configured'
                                ? 'badge-critical'
                                : 'badge-neutral'
                            }`}
                          >
                            {user.mfa}
                          </span>
                        </td>
                      )}

                      {visibleColumns.lastLogin && (
                        <td className="emc-td emc-td-mono">{user.lastLogin}</td>
                      )}

                      {visibleColumns.created && (
                        <td className="emc-td emc-td-mono">{user.createdDate}</td>
                      )}

                      <td className="emc-td" style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(user);
                          }}
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="emc-table-footer">
          <span>Showing {filteredUsers.length} of {users.length} enterprise users</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-secondary btn-xs" disabled>Previous</button>
            <button className="btn btn-secondary btn-xs" disabled>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};
