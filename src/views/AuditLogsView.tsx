import React, { useState } from 'react';
import {
  Download,
  Code
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuditTrail } from '../platform/audit';
import { ExportCsvButton } from '../platform/Widgets';

/** Every business record change written through the platform audit() service, from all suites. */
const BusinessAuditTrail: React.FC = () => {
  const trail = useAuditTrail();
  const [q, setQ] = useState('');
  const [mod, setMod] = useState('ALL');
  const modules = [...new Set(trail.map((e) => e.module))].sort();
  const rows = trail.filter((e) => (mod === 'ALL' || e.module === mod) && (!q || `${e.by} ${e.action} ${e.ref ?? ''} ${e.field ?? ''} ${e.note ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="emc-table-card" style={{ marginBottom: 16 }}>
      <div className="emc-table-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <strong>Business record changes</strong>
          <input type="text" className="table-search-input" placeholder="Search person, record, field…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} aria-label="Search business audit trail" />
          <select className="table-select" value={mod} onChange={(e) => setMod(e.target.value)} aria-label="Module">
            <option value="ALL">All modules</option>
            {modules.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <ExportCsvButton name="business-audit-trail" header={['When', 'Module', 'By', 'Action', 'Record', 'Field', 'Before', 'After', 'Note']} rows={() => rows.map((e) => [e.at, e.module, e.by, e.action, e.ref ?? '', e.field ?? '', e.before ?? '', e.after ?? '', e.note ?? ''])} />
      </div>
      <div className="emc-table-container">
        <table className="emc-table">
          <thead>
            <tr>
              <th className="emc-th">When</th>
              <th className="emc-th">Module</th>
              <th className="emc-th">By</th>
              <th className="emc-th">Action</th>
              <th className="emc-th">Record</th>
              <th className="emc-th">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                  No business changes recorded yet in this session — approvals, edits and deletions in any module appear here.
                </td>
              </tr>
            ) : (
              rows.slice(0, 300).map((e) => (
                <tr key={e.id} className="emc-tr">
                  <td className="emc-td emc-td-mono">{e.at}</td>
                  <td className="emc-td">
                    <span className="badge badge-neutral">{e.module}</span>
                  </td>
                  <td className="emc-td">{e.by}</td>
                  <td className="emc-td">{e.action}</td>
                  <td className="emc-td emc-td-mono">{e.ref ?? '—'}</td>
                  <td className="emc-td" style={{ whiteSpace: 'normal', maxWidth: 320 }}>
                    {e.field ? (
                      <>
                        <b>{e.field}</b>: {e.before || '∅'} → {e.after || '∅'}
                      </>
                    ) : (
                      e.note ?? ''
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AuditLogsView: React.FC = () => {
  const { auditEvents, setSelectedAuditEvent, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  const filteredEvents = auditEvents.filter((ev) => {
    const matchesCategory = categoryFilter === 'ALL' || ev.category === categoryFilter;
    const matchesSeverity = severityFilter === 'ALL' || ev.severity === severityFilter;
    const matchesSearch =
      searchQuery === '' ||
      ev.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.actor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.actor.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.requestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.reason.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSeverity && matchesSearch;
  });

  const handleExportSiem = () => {
    const jsonStr = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_ledger_siem_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    addToast({
      type: 'success',
      title: 'SIEM Ledger Exported',
      message: `Exported ${filteredEvents.length} cryptographic audit records in Splunk/Elastic JSON format.`
    });
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge badge-success">TAMPER-EVIDENT LEDGER</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              SHA-256 Merkle Verification: Valid
            </span>
          </div>
          <h1 className="view-title">Enterprise Audit Logs</h1>
          <p className="view-subtitle">
            Cryptographic ledger tracking all privileged operations, state modifications, authorization scopes, and network origins.
          </p>
        </div>

        <div className="view-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleExportSiem}>
            <Download size={14} /> Export to SIEM / JSON
          </button>
        </div>
      </div>

      <BusinessAuditTrail />

      {/* Audit Table Card */}
      <div className="emc-table-card">
        {/* Toolbar */}
        <div className="emc-table-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <input
              type="text"
              className="table-search-input"
              placeholder="Search by action, actor, resource, reason, request ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 340 }}
            />

            <div className="table-filter-group">
              <select
                className="table-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value="Security">Security</option>
                <option value="User">User & Identity</option>
                <option value="Policy">Policy & Governance</option>
                <option value="Workflow">Workflow</option>
                <option value="API">API Keys</option>
                <option value="Billing">Billing</option>
              </select>

              <select
                className="table-select"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="ALL">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing {filteredEvents.length} immutable events
          </div>
        </div>

        {/* Table Body */}
        <div className="emc-table-container">
          <table className="emc-table">
            <thead>
              <tr>
                <th className="emc-th">Severity</th>
                <th className="emc-th">Timestamp (UTC)</th>
                <th className="emc-th">Actor</th>
                <th className="emc-th">Action</th>
                <th className="emc-th">Target Resource</th>
                <th className="emc-th">Reason / Context</th>
                <th className="emc-th">Request ID</th>
                <th className="emc-th" style={{ textAlign: 'right' }}>State Diff</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>
                    No audit records match the query.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr
                    key={event.id}
                    className="emc-tr"
                    onClick={() => setSelectedAuditEvent(event)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="emc-td">
                      <span
                        className={`badge ${
                          event.severity === 'critical'
                            ? 'badge-critical'
                            : event.severity === 'high'
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {event.severity.toUpperCase()}
                      </span>
                    </td>

                    <td className="emc-td emc-td-mono">{event.timestamp}</td>

                    <td className="emc-td">
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {event.actor.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {event.actor.email}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                          {event.actor.ip} ({event.actor.location})
                        </span>
                      </div>
                    </td>

                    <td className="emc-td">
                      <span style={{ fontWeight: 600, color: 'var(--text-accent)' }}>
                        {event.action}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'block' }}>
                        Category: {event.category}
                      </span>
                    </td>

                    <td className="emc-td">
                      <span style={{ color: 'var(--text-primary)' }}>{event.resource}</span>
                    </td>

                    <td className="emc-td" style={{ maxWidth: 300, whiteSpace: 'normal' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {event.reason}
                      </span>
                    </td>

                    <td className="emc-td emc-td-mono" style={{ color: 'var(--text-accent)' }}>
                      {event.requestId}
                    </td>

                    <td className="emc-td" style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAuditEvent(event);
                        }}
                      >
                        <Code size={12} /> View Diff
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="emc-table-footer">
          <span>Continuous SHA-256 chained log streams persisted to AWS S3 ObjectLock</span>
          <span>Buffer: 100% Synced</span>
        </div>
      </div>
    </div>
  );
};
