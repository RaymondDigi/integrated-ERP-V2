import React, { useState } from 'react';
import {
  Check,
  X as XIcon,
  Plus,
  KeyRound,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AccessRequestsPanel, ModuleAccessPanel } from './PlatformPanels';

export const RolesView: React.FC = () => {
  const { roles, addToast } = useApp();
  const [selectedRoleIndex, setSelectedRoleIndex] = useState<number>(0);
  const [showElevationModal, setShowElevationModal] = useState<boolean>(false);

  const currentRole = roles[selectedRoleIndex];

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge badge-success">RBAC / ABAC HYBRID MATRIX</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              Evaluation Engine: Open Policy Agent (OPA)
            </span>
          </div>
          <h1 className="view-title">Roles & Access Control</h1>
          <p className="view-subtitle">
            Fine-grained entitlement policies, permission inheritance graphs, and Just-In-Time elevation.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowElevationModal(true)}
          >
            <KeyRound size={14} /> Request JIT Elevation
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'Custom Role Builder',
                message: 'Custom enterprise entitlement definition initiated.'
              })
            }
          >
            <Plus size={14} /> Define Custom Role
          </button>
        </div>
      </div>

      <AccessRequestsPanel />
      <ModuleAccessPanel />

      <div className="responsive-split-view">
        {/* Role Selection List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
            System & Enterprise Roles
          </div>

          {roles.map((role, idx) => (
            <div
              key={role.id}
              onClick={() => setSelectedRoleIndex(idx)}
              style={{
                background: selectedRoleIndex === idx ? 'var(--bg-active)' : 'var(--bg-surface)',
                border: selectedRoleIndex === idx ? '1px solid var(--border-focus)' : '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                  {role.name}
                </span>
                {role.isSystem && <span className="badge badge-neutral">System</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {role.assignedUsersCount} active users assigned
              </div>
            </div>
          ))}
        </div>

        {/* Permission Matrix Detail */}
        <div className="emc-table-card">
          <div className="emc-table-toolbar">
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {currentRole.name}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {currentRole.description}
              </p>
            </div>
            <span className="badge badge-neutral">{currentRole.permissions.length} Domains</span>
          </div>

          <div className="emc-table-container">
            <table className="emc-table">
              <thead>
                <tr>
                  <th className="emc-th">Security Domain</th>
                  <th className="emc-th">Scope Description</th>
                  <th className="emc-th" style={{ textAlign: 'center' }}>Read</th>
                  <th className="emc-th" style={{ textAlign: 'center' }}>Write</th>
                  <th className="emc-th" style={{ textAlign: 'center' }}>Delete</th>
                  <th className="emc-th" style={{ textAlign: 'center' }}>Admin / Grant</th>
                </tr>
              </thead>
              <tbody>
                {currentRole.permissions.map((perm, i) => (
                  <tr key={i} className="emc-tr">
                    <td className="emc-td" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {perm.domain}
                    </td>
                    <td className="emc-td" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {perm.description}
                    </td>
                    <td className="emc-td" style={{ textAlign: 'center' }}>
                      {perm.read ? (
                        <Check size={16} color="var(--status-success)" style={{ margin: '0 auto' }} />
                      ) : (
                        <XIcon size={14} color="var(--text-tertiary)" style={{ margin: '0 auto' }} />
                      )}
                    </td>
                    <td className="emc-td" style={{ textAlign: 'center' }}>
                      {perm.write ? (
                        <Check size={16} color="var(--status-success)" style={{ margin: '0 auto' }} />
                      ) : (
                        <XIcon size={14} color="var(--text-tertiary)" style={{ margin: '0 auto' }} />
                      )}
                    </td>
                    <td className="emc-td" style={{ textAlign: 'center' }}>
                      {perm.delete ? (
                        <Check size={16} color="var(--status-critical)" style={{ margin: '0 auto' }} />
                      ) : (
                        <XIcon size={14} color="var(--text-tertiary)" style={{ margin: '0 auto' }} />
                      )}
                    </td>
                    <td className="emc-td" style={{ textAlign: 'center' }}>
                      {perm.admin ? (
                        <span className="badge badge-critical">AUTHORIZED</span>
                      ) : (
                        <span className="badge badge-neutral">DENIED</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Just In Time Temporary Elevation Modal */}
      {showElevationModal && (
        <div className="emc-drawer-backdrop" onClick={() => setShowElevationModal(false)}>
          <div
            className="emc-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-emphasis)',
              borderRadius: 6,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Request Just-In-Time (JIT) Elevation
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Temporary privileged access grants automatically expire and require dual-custody authorization.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Target Privilege Level
                </label>
                <select className="table-select" style={{ width: '100%', padding: '8px' }}>
                  <option>Super Admin (Emergency Break-Glass)</option>
                  <option>DevOps Lead (Production Kernel Access)</option>
                  <option>Security Officer (Forensics Snapshot Access)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Elevation Duration
                </label>
                <select className="table-select" style={{ width: '100%', padding: '8px' }}>
                  <option>1 Hour (Auto-revocation)</option>
                  <option>4 Hours (Standard Maintenance Window)</option>
                  <option>8 Hours (Full Shift)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Change Ticket / CAB Reference
                </label>
                <input
                  type="text"
                  className="table-search-input"
                  style={{ width: '100%' }}
                  placeholder="e.g. CHG-8812 or INC-4109"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowElevationModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setShowElevationModal(false);
                  addToast({
                    type: 'success',
                    title: 'Elevation Request Submitted',
                    message: 'JIT Elevation request dispatched to On-Call Approver.'
                  });
                }}
              >
                Submit Elevation Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
