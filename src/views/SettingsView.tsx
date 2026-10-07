import React, { useState } from 'react';
import {
  Lock,
  Database,
  Globe,
  Save,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SettingsView: React.FC = () => {
  const { addToast } = useApp();

  const [idleTimeout, setIdleTimeout] = useState('15');
  const [requireReAuth, setRequireReAuth] = useState(true);
  const [retentionDays, setRetentionDays] = useState('365');
  const [ipAllowlist, setIpAllowlist] = useState('198.51.100.0/24\n203.0.113.0/24\n10.240.0.0/16');

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Settings Persisted',
      message: 'Enterprise governance policies updated and broadcast to edge proxies.'
    });
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Enterprise Platform Settings & Governance</h1>
          <p className="view-subtitle">
            Configure global session lifetimes, cryptographic IP allowlists, SIEM forwarders, and data retention rules.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>

      <div className="responsive-grid-equal">
        {/* Session Security Policy */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} color="var(--brand-primary)" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Authentication & Session Lifetime
            </h3>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              Idle Session Inactivity Timeout (Minutes)
            </label>
            <input
              type="number"
              className="table-search-input"
              style={{ width: '100%' }}
              value={idleTimeout}
              onChange={(e) => setIdleTimeout(e.target.value)}
            />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
              Complies with SOC2 CC6.1 and NIST 800-63B standards (15m recommended)
            </span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={requireReAuth}
              onChange={(e) => setRequireReAuth(e.target.checked)}
            />
            <span>Force cryptographic re-authentication if client IP address drifts</span>
          </label>
        </div>

        {/* Data Retention & Cryptographic Ledger */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={18} color="var(--status-success)" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Data Retention & Compliance Vault
            </h3>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              Immutable Audit Ledger Retention (Days)
            </label>
            <select
              className="table-select"
              style={{ width: '100%', padding: '8px' }}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
            >
              <option value="90">90 Days (Standard Tier)</option>
              <option value="365">365 Days (SOC2 Type II Mandate)</option>
              <option value="2555">7 Years (FINRA / HIPAA Compliance)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
              Enterprise S3 ObjectLock Destination
            </label>
            <input
              type="text"
              className="table-search-input"
              style={{ width: '100%' }}
              disabled
              value="s3://missioncontrol-immutable-audit-ledger-us-east-1"
            />
          </div>
        </div>

        {/* IP Allowlists */}
        <div style={{ gridColumn: '1 / -1', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Globe size={18} color="var(--brand-primary)" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              Corporate CIDR & Gateway IP Allowlists
            </h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Only incoming connections originating from approved enterprise CIDRs can execute Super Admin or Root privileged actions.
          </p>
          <textarea
            className="table-search-input"
            rows={4}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            value={ipAllowlist}
            onChange={(e) => setIpAllowlist(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
