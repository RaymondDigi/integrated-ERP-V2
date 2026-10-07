import React, { useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {  WorkQueueCategory, WorkItemStatus } from '../types';

export const WorkQueueView: React.FC = () => {
  const {
    workItems,
    setSelectedWorkItem,
    acknowledgeWorkItem,
    snoozeWorkItem,
    resolveWorkItem,
    executeWorkItemAction
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<WorkQueueCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | WorkItemStatus>('OPEN');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const categories: { id: WorkQueueCategory; label: string; count: number }[] = [
    { id: 'All', label: 'All Items', count: workItems.length },
    { id: 'Critical', label: 'Critical', count: workItems.filter((w) => w.severity === 'CRITICAL').length },
    { id: 'Security', label: 'Security', count: workItems.filter((w) => w.category === 'Security').length },
    { id: 'Operations', label: 'Operations', count: workItems.filter((w) => w.category === 'Operations').length },
    { id: 'Approvals', label: 'Approvals', count: workItems.filter((w) => w.category === 'Approvals').length },
    { id: 'Finance', label: 'Finance', count: workItems.filter((w) => w.category === 'Finance').length },
    { id: 'AI Recommendations', label: 'AI Insights', count: workItems.filter((w) => w.category === 'AI Recommendations').length }
  ];

  const filteredItems = workItems.filter((item) => {
    const matchesCategory =
      activeCategory === 'All' ||
      (activeCategory === 'Critical' && item.severity === 'CRITICAL') ||
      item.category === activeCategory;

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'OPEN' ? item.status === 'OPEN' || item.status === 'IN_TRIAGE' : item.status === statusFilter);

    const matchesSearch =
      searchQuery === '' ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesStatus && matchesSearch;
  });

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAcknowledge = () => {
    selectedIds.forEach((id) => acknowledgeWorkItem(id));
    setSelectedIds([]);
  };

  const handleBulkSnooze = (hours: number) => {
    selectedIds.forEach((id) => snoozeWorkItem(id, hours));
    setSelectedIds([]);
  };

  const handleBulkResolve = () => {
    selectedIds.forEach((id) => resolveWorkItem(id, 'Bulk administrative resolution'));
    setSelectedIds([]);
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Operational Work Queue</h1>
          <p className="view-subtitle">
            Attention → Understand → Decide → Act → Verify. Continuous automated triage engine.
          </p>
        </div>

        <div className="view-actions">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing {filteredItems.length} of {workItems.length} items
          </span>
        </div>
      </div>

      {/* Category Filter Tabs & Search Controls */}
      <div className="responsive-toolbar" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
        <div className="tab-list tab-list-scrollable" style={{ flex: 1, minWidth: 260 }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            className="table-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter by Status"
          >
            <option value="OPEN">Status: Active / In Triage</option>
            <option value="ALL">Status: All (Including Resolved)</option>
            <option value="RESOLVED">Status: Resolved Only</option>
            <option value="SNOOZED">Status: Snoozed Only</option>
            <option value="ESCALATED">Status: Escalated Only</option>
          </select>

          <input
            type="text"
            className="table-search-input"
            placeholder="Search work queue items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk Action Sticky Bar (when rows are selected) */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: 'var(--bg-active)',
            border: '1px solid var(--border-focus)',
            padding: '8px 16px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            animation: 'fadeIn 0.1s ease'
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-xs" onClick={handleBulkAcknowledge}>
              Acknowledge Selected
            </button>
            <button className="btn btn-secondary btn-xs" onClick={() => handleBulkSnooze(4)}>
              Snooze (4h)
            </button>
            <button className="btn btn-primary btn-xs" onClick={handleBulkResolve}>
              Resolve Selected
            </button>
            <button className="btn btn-ghost btn-xs" onClick={() => setSelectedIds([])}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Work Queue Items List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <CheckCircle2 size={36} color="var(--status-success)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Work Queue is Clear
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              No items require attention under current filter criteria.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className="work-item-card"
                onClick={() => setSelectedWorkItem(item)}
                style={{
                  background: isSelected ? 'rgba(35, 120, 87, 0.08)' : 'var(--bg-surface)',
                  border: isSelected
                    ? '1px solid var(--brand-primary)'
                    : item.severity === 'CRITICAL'
                    ? '1px solid var(--status-critical-border)'
                    : '1px solid var(--border-subtle)',
                  borderLeft:
                    item.severity === 'CRITICAL'
                      ? '4px solid var(--status-critical)'
                      : item.severity === 'WARNING'
                      ? '4px solid var(--status-warning)'
                      : item.severity === 'APPROVAL'
                      ? '4px solid var(--status-approval)'
                      : '4px solid var(--brand-primary)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                  <div
                    onClick={(e) => handleToggleSelect(item.id, e)}
                    style={{ cursor: 'pointer', marginTop: 3, color: 'var(--text-secondary)' }}
                  >
                    {isSelected ? <CheckSquare size={16} color="var(--brand-primary)" /> : <Square size={16} />}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        className={`badge ${
                          item.severity === 'CRITICAL'
                            ? 'badge-critical'
                            : item.severity === 'WARNING'
                            ? 'badge-warning'
                            : item.severity === 'APPROVAL'
                            ? 'badge-approval'
                            : 'badge-ai'
                        }`}
                      >
                        {item.severity}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        {item.id}
                      </span>
                      <span className="badge badge-neutral">{item.category}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Detected {item.detectedTime}
                      </span>
                      <span
                        className={`badge ${
                          item.status === 'RESOLVED'
                            ? 'badge-success'
                            : item.status === 'ESCALATED'
                            ? 'badge-critical'
                            : item.status === 'IN_TRIAGE'
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {item.title}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {item.description}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      <span>Resource: {item.resource}</span>
                      <span>Owner: {item.owner}</span>
                    </div>
                  </div>
                </div>

                {/* Direct Action Column */}
                <div className="work-item-actions">
                  <button
                    className={`btn btn-sm ${item.recommendedAction.danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      executeWorkItemAction(item.id);
                    }}
                  >
                    {item.recommendedAction.label}
                  </button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {item.status === 'OPEN' && (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          acknowledgeWorkItem(item.id);
                        }}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        snoozeWorkItem(item.id, 4);
                      }}
                    >
                      Snooze 4h
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        resolveWorkItem(item.id, 'One-click resolved from Work Queue');
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
