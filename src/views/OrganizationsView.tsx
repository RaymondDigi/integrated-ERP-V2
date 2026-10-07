import React, { useState } from 'react';
import {
  Building,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OrganizationsView: React.FC = () => {
  const { organizations, setCurrentView, setSelectedOrgId, addToast } = useApp();
  const [search, setSearch] = useState('');

  const filteredOrgs = organizations.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()) ||
      o.tier.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Organizations & Multi-Tenant Boundaries</h1>
          <p className="view-subtitle">
            Enterprise boundary partitions, data residency, SSO federations, and tier contracts.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'Provision Tenant',
                message: 'Enterprise dedicated tenant provisioning wizard started.'
              })
            }
          >
            <Plus size={14} /> Provision Tenant
          </button>
        </div>
      </div>

      <div className="emc-table-card">
        <div className="emc-table-toolbar">
          <input
            type="text"
            className="table-search-input"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {filteredOrgs.length} Enterprise Tenants
          </span>
        </div>

        <div className="emc-table-container">
          <table className="emc-table">
            <thead>
              <tr>
                <th className="emc-th">Organization</th>
                <th className="emc-th">Contract Tier</th>
                <th className="emc-th">Members</th>
                <th className="emc-th">SSO State</th>
                <th className="emc-th">Compliance</th>
                <th className="emc-th">Region</th>
                <th className="emc-th">Monthly Spend</th>
                <th className="emc-th" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.map((org) => (
                <tr key={org.id} className="emc-tr">
                  <td className="emc-td">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 4,
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Building size={16} color="var(--brand-primary)" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {org.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {org.domain} · {org.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="emc-td">
                    <span className="badge badge-neutral">{org.tier}</span>
                  </td>

                  <td className="emc-td emc-td-mono">
                    {org.usersCount.toLocaleString()} users
                  </td>

                  <td className="emc-td">
                    <span
                      className={`badge ${
                        org.ssoStatus === 'Healthy'
                          ? 'badge-success'
                          : org.ssoStatus === 'Degraded'
                          ? 'badge-critical'
                          : 'badge-warning'
                      }`}
                    >
                      {org.ssoStatus}
                    </span>
                  </td>

                  <td className="emc-td">
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {org.complianceStatus}
                    </span>
                  </td>

                  <td className="emc-td emc-td-mono">{org.region}</td>

                  <td className="emc-td emc-td-mono">
                    ${org.monthlySpend.toLocaleString()}/mo
                  </td>

                  <td className="emc-td" style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => {
                        setSelectedOrgId(org.id);
                        setCurrentView('users');
                      }}
                    >
                      Switch Context →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
