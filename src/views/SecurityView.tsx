import React, { useState } from 'react';
import {
  RefreshCw,
  Copy,
  Check,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SecurityPolicyPanel } from './PlatformPanels';

export const SecurityView: React.FC = () => {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'sso' | 'mfa' | 'keys' | 'events'>('keys');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [apiKeys, setApiKeys] = useState([
    {
      id: 'key_live_9942a',
      name: 'prod-billing-worker-legacy',
      prefix: 'live_sec_9942...',
      scope: 'billing:read, billing:write, invoices:sync',
      created: '2025-09-10',
      lastUsed: '2 mins ago',
      expiresIn: '48 hours (EXPIRING)',
      status: 'EXPIRING'
    },
    {
      id: 'key_live_8892f',
      name: 'srv-metrics-ingest-v2',
      prefix: 'live_sec_8892...',
      scope: 'telemetry:write, metrics:ingest',
      created: '2026-09-08',
      lastUsed: 'Just now',
      expiresIn: '89 days',
      status: 'ACTIVE'
    },
    {
      id: 'key_live_4102b',
      name: 'scim-directory-sync-agent',
      prefix: 'live_sec_4102...',
      scope: 'users:read, users:provision, groups:sync',
      created: '2026-06-12',
      lastUsed: '4 mins ago',
      expiresIn: '180 days',
      status: 'ACTIVE'
    }
  ]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRotateKey = (id: string) => {
    setApiKeys((prev) =>
      prev.map((k) =>
        k.id === id
          ? {
              ...k,
              prefix: 'live_sec_rotated_' + Math.random().toString(36).substr(2, 4) + '...',
              expiresIn: '90 days',
              status: 'ACTIVE'
            }
          : k
      )
    );
    addToast({
      type: 'success',
      title: 'API Key Rotated',
      message: `24-hour dual-token grace period enabled. Previous key will revoke automatically tomorrow.`
    });
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge badge-success">ZERO TRUST ARCHITECTURE</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              FIPS 140-2 Cryptographic Module
            </span>
          </div>
          <h1 className="view-title">Enterprise Security Center</h1>
          <p className="view-subtitle">
            SSO identity federation, hardware MFA enforcement policies, scoped API credentials, and threat telemetry.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'New API Key',
                message: 'Scoped credential provisioning wizard launched.'
              })
            }
          >
            <Plus size={14} /> Create API Key
          </button>
        </div>
      </div>

      <SecurityPolicyPanel />

      {/* Tabs */}
      <div className="tab-list tab-list-scrollable">
        <button
          className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          API Keys & Service Principals ({apiKeys.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'mfa' ? 'active' : ''}`}
          onClick={() => setActiveTab('mfa')}
        >
          Multi-Factor Authentication (MFA)
        </button>
        <button
          className={`tab-btn ${activeTab === 'sso' ? 'active' : ''}`}
          onClick={() => setActiveTab('sso')}
        >
          SSO & Identity Providers
        </button>
        <button
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Real-time Security Events
        </button>
      </div>

      {activeTab === 'keys' && (
        <div className="emc-table-card">
          <div className="emc-table-toolbar">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Active Cryptographic Tokens
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Secrets are hashed with Argon2id and stored in AWS KMS HSM
            </span>
          </div>

          <div className="emc-table-container">
            <table className="emc-table">
              <thead>
                <tr>
                  <th className="emc-th">Credential Name</th>
                  <th className="emc-th">Key Prefix</th>
                  <th className="emc-th">Assigned Scopes</th>
                  <th className="emc-th">Created</th>
                  <th className="emc-th">Last Used</th>
                  <th className="emc-th">Expiration Status</th>
                  <th className="emc-th" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id} className="emc-tr">
                    <td className="emc-td" style={{ fontWeight: 600 }}>{key.name}</td>
                    <td className="emc-td emc-td-mono">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{key.prefix}</span>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleCopy(key.id, key.prefix)}
                          title="Copy prefix"
                        >
                          {copiedKey === key.id ? <Check size={12} color="var(--status-success)" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>
                    <td className="emc-td" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {key.scope}
                    </td>
                    <td className="emc-td emc-td-mono">{key.created}</td>
                    <td className="emc-td emc-td-mono">{key.lastUsed}</td>
                    <td className="emc-td">
                      <span className={`badge ${key.status === 'EXPIRING' ? 'badge-warning' : 'badge-success'}`}>
                        {key.expiresIn}
                      </span>
                    </td>
                    <td className="emc-td" style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => handleRotateKey(key.id)}
                      >
                        <RefreshCw size={12} /> Rotate Key
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'mfa' && (
        <div className="responsive-grid-equal">
          <div className="pulse-card">
            <span className="pulse-label">MFA Enforcement Policy</span>
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Mandatory for All Privileged Roles
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              FIDO2 WebAuthn (YubiKey, Touch ID, Windows Hello) and TOTP Authenticator apps supported. SMS-based OTP is deprecated for security compliance.
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  addToast({
                    type: 'success',
                    title: 'Policy Enforced',
                    message: 'Global FIDO2 hardware token enforcement policy updated.'
                  })
                }
              >
                Enforce FIDO2 Globally
              </button>
            </div>
          </div>

          <div className="pulse-card">
            <span className="pulse-label">Current Enrollment Telemetry</span>
            <div className="pulse-value-row" style={{ marginTop: 8 }}>
              <span className="pulse-value">96.7%</span>
              <span className="pulse-delta positive">Compliant</span>
            </div>
            <span className="pulse-subtext">3 Super Admin accounts require enrollment (WI-8941)</span>
          </div>
        </div>
      )}

      {activeTab === 'sso' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Okta Workforce Identity SAML 2.0
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Federated enterprise authentication with Just-In-Time role provisioning.
                </p>
              </div>
              <span className="badge badge-success">ACTIVE & ENFORCED</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="emc-table-card">
          <div className="emc-table-toolbar">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Live Intrusion & Anomaly Stream
            </span>
            <span className="badge badge-neutral">Streaming Snort/Suricata Logs</span>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { time: '16:22:11 UTC', type: 'FAILED_AUTH_SPIKE', text: '12 failed logins detected from TOR exit node 185.220.101.4', severity: 'critical' },
              { time: '15:40:02 UTC', type: 'IMPOSSIBLE_TRAVEL', text: 'User marcus.vance logged in from Frankfurt 10m after New York session', severity: 'warning' },
              { time: '14:12:49 UTC', type: 'PRIVILEGE_ESCALATION', text: 'JIT Elevation approved for David Chen (Staff SRE)', severity: 'info' }
            ].map((ev, i) => (
              <div
                key={i}
                style={{
                  padding: 10,
                  background: 'var(--bg-surface-subtle)',
                  borderRadius: 4,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`badge ${ev.severity === 'critical' ? 'badge-critical' : ev.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                      {ev.type}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {ev.text}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  {ev.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
