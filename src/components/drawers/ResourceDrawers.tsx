import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  Smartphone,
  CheckCircle,
  Ban,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ResourceDrawers: React.FC = () => {
  const {
    selectedUser,
    setSelectedUser,
    selectedWorkItem,
    setSelectedWorkItem,
    selectedAuditEvent,
    setSelectedAuditEvent,
    suspendUser,
    activateUser,
    resetUserMfa,
    revokeSession,
    revokeAllSessions,
    changeUserRole,
    acknowledgeWorkItem,
    snoozeWorkItem,
    resolveWorkItem,
    escalateWorkItem,
    executeWorkItemAction,
    auditEvents
  } = useApp();

  const [userTab, setUserTab] = useState<'overview' | 'access' | 'sessions' | 'audit'>('overview');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState(selectedUser?.role || 'Analyst');

  // --- USER DETAIL DRAWER ---
  if (selectedUser) {
    const userAuditLogs = auditEvents.filter(
      (a) => a.resource.includes(selectedUser.id) || a.actor.email === selectedUser.email
    );

    return (
      <div className="emc-drawer-backdrop" onClick={() => setSelectedUser(null)}>
        <div className="emc-drawer" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="emc-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 6,
                  background: '#237857',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 16
                }}
              >
                {selectedUser.avatar}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedUser.name}
                  </h3>
                  <span
                    className={`badge ${
                      selectedUser.status === 'Active'
                        ? 'badge-success'
                        : selectedUser.status === 'Suspended'
                        ? 'badge-critical'
                        : 'badge-warning'
                    }`}
                  >
                    ● {selectedUser.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {selectedUser.email} · <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedUser.id}</span>
                </div>
              </div>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setSelectedUser(null)}
              title="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Action Bar */}
          <div
            style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {selectedUser.status === 'Active' ? (
                <button
                  className="btn btn-danger btn-xs"
                  onClick={() => {
                    if (confirm(`Are you sure you want to suspend ${selectedUser.name}? All active sessions will be terminated immediately.`)) {
                      suspendUser(selectedUser.id);
                    }
                  }}
                >
                  <Ban size={12} /> Suspend User
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => activateUser(selectedUser.id)}
                >
                  <CheckCircle size={12} /> Re-activate User
                </button>
              )}

              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  if (confirm(`Revoke MFA credentials for ${selectedUser.name}? User must re-enroll upon next sign-in.`)) {
                    resetUserMfa(selectedUser.id);
                  }
                }}
              >
                <KeyRound size={12} /> Reset MFA
              </button>

              <button
                className="btn btn-secondary btn-xs"
                onClick={() => setShowRoleModal(true)}
              >
                <ShieldCheck size={12} /> Change Role
              </button>
            </div>

            <span className="badge badge-neutral">{selectedUser.role}</span>
          </div>

          {/* Tabs */}
          <div style={{ padding: '0 20px', background: 'var(--bg-surface-subtle)' }}>
            <div className="tab-list tab-list-scrollable">
              <button
                className={`tab-btn ${userTab === 'overview' ? 'active' : ''}`}
                onClick={() => setUserTab('overview')}
              >
                Overview
              </button>
              <button
                className={`tab-btn ${userTab === 'access' ? 'active' : ''}`}
                onClick={() => setUserTab('access')}
              >
                Access & RBAC
              </button>
              <button
                className={`tab-btn ${userTab === 'sessions' ? 'active' : ''}`}
                onClick={() => setUserTab('sessions')}
              >
                Active Sessions ({selectedUser.sessions.length})
              </button>
              <button
                className={`tab-btn ${userTab === 'audit' ? 'active' : ''}`}
                onClick={() => setUserTab('audit')}
              >
                Audit Log ({userAuditLogs.length})
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="emc-drawer-body">
            {userTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="responsive-grid-equal" style={{ gap: 12 }}>
                  <div className="pulse-card">
                    <span className="pulse-label">Organization</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                      {selectedUser.organizationName}
                    </span>
                    <span className="pulse-subtext">{selectedUser.organizationId}</span>
                  </div>
                  <div className="pulse-card">
                    <span className="pulse-label">Department</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                      {selectedUser.department}
                    </span>
                    <span className="pulse-subtext">Enterprise Group</span>
                  </div>
                  <div className="pulse-card">
                    <span className="pulse-label">MFA Configuration</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                      {selectedUser.mfa}
                    </span>
                    <span className="pulse-subtext">Hardware FIDO2 / TOTP</span>
                  </div>
                  <div className="pulse-card">
                    <span className="pulse-label">Last Active</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                      {selectedUser.lastLogin}
                    </span>
                    <span className="pulse-subtext">Created: {selectedUser.createdDate}</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-subtle)', padding: 14, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: '0.05em' }}>
                    Security Boundary & Compliance
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Privilege Level</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedUser.role === 'Super Admin' ? 'CRITICAL (Root Access)' : 'Standard Enterprise'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Identity Provider</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Okta Enterprise SAML 2.0</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Direct Permissions</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedUser.directPermissionsCount} rules</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Inherited Tenant Permissions</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedUser.inheritedPermissionsCount} rules</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {userTab === 'access' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Assigned Role: <strong style={{ color: 'var(--text-primary)' }}>{selectedUser.role}</strong>. Permissions are evaluated using combined RBAC and ABAC policy engine with real-time continuous evaluation.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { domain: 'IAM & Authentication', level: 'Full Admin (write, grant, rotate)' },
                    { domain: 'Organization Controls', level: 'Scoped to Enterprise boundary' },
                    { domain: 'Workflows & DAG Execution', level: 'Read, Execute, Retry' },
                    { domain: 'Audit & Compliance Ledger', level: 'Tamper-Evident Read' },
                    { domain: 'System Telemetry & Metrics', level: 'Real-time Metrics Read' }
                  ].map((perm, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{perm.domain}</span>
                      <span className="badge badge-neutral">{perm.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {userTab === 'sessions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Active cryptographic JWT refresh sessions.
                  </span>
                  {selectedUser.sessions.length > 0 && (
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => revokeAllSessions(selectedUser.id)}
                    >
                      Terminate All Sessions
                    </button>
                  )}
                </div>

                {selectedUser.sessions.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                    No active sessions found for this user.
                  </div>
                ) : (
                  selectedUser.sessions.map((sess) => (
                    <div
                      key={sess.id}
                      style={{
                        padding: 12,
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Smartphone size={14} color="var(--text-secondary)" />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {sess.device}
                          </span>
                          {sess.isCurrent && <span className="badge badge-success">This Device</span>}
                        </div>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => revokeSession(selectedUser.id, sess.id)}
                        >
                          Revoke
                        </button>
                      </div>

                      <div className="responsive-grid-equal" style={{ gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        <div>IP: {sess.ip}</div>
                        <div>Location: {sess.location}</div>
                        <div>Last Active: {sess.lastActive}</div>
                        <div>Session ID: {sess.id}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {userTab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {userAuditLogs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                    No audit records found matching this user identity.
                  </div>
                ) : (
                  userAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => setSelectedAuditEvent(log)}
                      style={{
                        padding: 10,
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {log.action}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                          {log.timestamp}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{log.reason}</div>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        Req ID: {log.requestId} · IP: {log.actor.ip}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Role Change Modal Overlay */}
          {showRoleModal && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                zIndex: 70
              }}
            >
              <div
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  padding: 20,
                  width: '100%',
                  maxWidth: 420,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}
              >
                <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Change User Role
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Select the target role for {selectedUser.name}. Elevating privileges requires dual-custody audit logging.
                </p>

                <select
                  className="table-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
                >
                  <option value="Super Admin">Super Admin (Unrestricted)</option>
                  <option value="Organization Admin">Organization Admin</option>
                  <option value="Security Officer">Security Officer</option>
                  <option value="DevOps Lead">DevOps Lead</option>
                  <option value="Compliance Auditor">Compliance Auditor</option>
                  <option value="Analyst">Analyst (Read-Only)</option>
                </select>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowRoleModal(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      changeUserRole(selectedUser.id, newRole as any);
                      setShowRoleModal(false);
                    }}
                  >
                    Confirm Role Change
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="emc-drawer-footer">
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUser(null)}>
              Close Panel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- WORK ITEM TRIAGE DRAWER ---
  if (selectedWorkItem) {
    return (
      <div className="emc-drawer-backdrop" onClick={() => setSelectedWorkItem(null)}>
        <div className="emc-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="emc-drawer-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  className={`badge ${
                    selectedWorkItem.severity === 'CRITICAL'
                      ? 'badge-critical'
                      : selectedWorkItem.severity === 'WARNING'
                      ? 'badge-warning'
                      : selectedWorkItem.severity === 'APPROVAL'
                      ? 'badge-approval'
                      : 'badge-ai'
                  }`}
                >
                  {selectedWorkItem.severity}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  {selectedWorkItem.id}
                </span>
                <span className="badge badge-neutral">{selectedWorkItem.category}</span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {selectedWorkItem.title}
              </h3>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setSelectedWorkItem(null)}
              title="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="emc-drawer-body">
            {/* Description & Resource */}
            <div style={{ background: 'var(--bg-surface-subtle)', padding: 14, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {selectedWorkItem.description}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                <span>Resource: {selectedWorkItem.resource}</span>
                <span>Detected: {selectedWorkItem.detectedTime}</span>
                <span>Owner: {selectedWorkItem.owner}</span>
              </div>
            </div>

            {/* Impact Analysis */}
            <div>
              <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.05em' }}>
                Operational Impact & Root Cause
              </h4>
              <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Reason: </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedWorkItem.details.reason}</span>
                </div>
                <div>
                  <strong style={{ color: 'var(--status-critical-text)' }}>Impact: </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedWorkItem.details.impact}</span>
                </div>
              </div>
            </div>

            {/* Evidence Telemetry */}
            <div>
              <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.05em' }}>
                Telemetry Evidence
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedWorkItem.details.evidence.map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: 'var(--text-accent)'
                    }}
                  >
                    ▸ {ev}
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended Action Box */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(35, 120, 87, 0.08) 0%, rgba(17, 24, 39, 0.8) 100%)',
                border: '1px solid var(--brand-primary)',
                padding: 14,
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-primary)', letterSpacing: '0.05em' }}>
                  Recommended Action (1-Click Remediation)
                </span>
                <span className="badge badge-info">Authorizable</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedWorkItem.recommendedAction.label}
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  executeWorkItemAction(selectedWorkItem.id);
                  setSelectedWorkItem(null);
                }}
              >
                Execute Remediation Action Now
              </button>
            </div>

            {/* Audit Trail & History */}
            <div>
              <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.05em' }}>
                Triage History
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedWorkItem.details.auditTrail.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--bg-surface-subtle)',
                      borderLeft: '2px solid var(--border-default)',
                      fontSize: 12
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', fontSize: 11 }}>
                      <span>{entry.actor}</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{entry.time}</span>
                    </div>
                    <div style={{ color: 'var(--text-primary)', marginTop: 2 }}>{entry.action}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="emc-drawer-footer">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                acknowledgeWorkItem(selectedWorkItem.id);
                setSelectedWorkItem(null);
              }}
            >
              Acknowledge
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                snoozeWorkItem(selectedWorkItem.id, 4);
                setSelectedWorkItem(null);
              }}
            >
              Snooze (4h)
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                escalateWorkItem(selectedWorkItem.id);
                setSelectedWorkItem(null);
              }}
            >
              Escalate P0
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                resolveWorkItem(selectedWorkItem.id, 'Resolved via Mission Control Work Queue');
                setSelectedWorkItem(null);
              }}
            >
              Mark Resolved
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- AUDIT EVENT DETAIL DRAWER ---
  if (selectedAuditEvent) {
    return (
      <div className="emc-drawer-backdrop" onClick={() => setSelectedAuditEvent(null)}>
        <div className="emc-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="emc-drawer-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className={`badge ${selectedAuditEvent.severity === 'critical' ? 'badge-critical' : selectedAuditEvent.severity === 'high' ? 'badge-warning' : 'badge-neutral'}`}>
                  {selectedAuditEvent.severity.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                  {selectedAuditEvent.requestId}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedAuditEvent.action}
              </h3>
            </div>
            <button
              className="btn-ghost"
              onClick={() => setSelectedAuditEvent(null)}
              title="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="emc-drawer-body">
            {/* Actor & Authorization Metadata */}
            <div style={{ background: 'var(--bg-surface-subtle)', padding: 14, borderRadius: 6, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Actor Identity:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedAuditEvent.actor.name} ({selectedAuditEvent.actor.email})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Assigned Role:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedAuditEvent.actor.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Originating IP & Location:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {selectedAuditEvent.actor.ip} · {selectedAuditEvent.actor.location}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Timestamp:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {selectedAuditEvent.timestamp}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Target Resource:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedAuditEvent.resource}
                </span>
              </div>
            </div>

            {/* Change Reason & Auth Context */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                Stated Business Justification
              </h4>
              <div style={{ padding: 10, background: 'var(--bg-surface-elevated)', borderRadius: 4, border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-primary)' }}>
                {selectedAuditEvent.reason}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                Authorization Context & Policy
              </h4>
              <div style={{ padding: 10, background: 'var(--bg-surface-elevated)', borderRadius: 4, border: '1px solid var(--border-subtle)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {selectedAuditEvent.authContext}
              </div>
            </div>

            {/* Side-by-Side State Diff */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h4 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                Cryptographic State Diff (Before vs After)
              </h4>
              <div className="diff-viewer">
                <div className="diff-pane">
                  <div className="diff-pane-title">Before State</div>
                  <pre>
                    {selectedAuditEvent.beforeState ? (
                      JSON.stringify(selectedAuditEvent.beforeState, null, 2)
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>null (Entity created or null baseline)</span>
                    )}
                  </pre>
                </div>
                <div className="diff-pane">
                  <div className="diff-pane-title">After State</div>
                  <pre>
                    {selectedAuditEvent.afterState ? (
                      JSON.stringify(selectedAuditEvent.afterState, null, 2)
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>null (Entity deleted)</span>
                    )}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          <div className="emc-drawer-footer">
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedAuditEvent(null)}>
              Dismiss
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(selectedAuditEvent, null, 2));
                alert('Audit event JSON copied to clipboard');
              }}
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
