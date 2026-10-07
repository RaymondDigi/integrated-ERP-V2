import React from 'react';
import {
  Download,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const BillingView: React.FC = () => {
  const { invoices, addToast } = useApp();

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Billing, Subscriptions & Invoicing</h1>
          <p className="view-subtitle">
            Enterprise committed tiers, metered consumption overages, multi-tenant invoices, and payment methods.
          </p>
        </div>
      </div>

      <div className="pulse-grid">
        <div className="pulse-card">
          <span className="pulse-label">Committed Annual Contract</span>
          <div className="pulse-value-row">
            <span className="pulse-value">$2.4M ARR</span>
            <span className="badge badge-success">Active</span>
          </div>
          <span className="pulse-subtext">Enterprise Dedicated Agreement</span>
        </div>

        <div className="pulse-card">
          <span className="pulse-label">Current Monthly Run-Rate</span>
          <div className="pulse-value-row">
            <span className="pulse-value">$210,800</span>
            <span className="pulse-delta positive">+4.8%</span>
          </div>
          <span className="pulse-subtext">Day 8 of 30 in cycle</span>
        </div>

        <div className="pulse-card">
          <span className="pulse-label">Pending Invoices</span>
          <div className="pulse-value-row">
            <span className="pulse-value">2 Due</span>
            <span className="pulse-delta positive">$78,800</span>
          </div>
          <span className="pulse-subtext">Net 30 terms</span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="emc-table-card">
        <div className="emc-table-toolbar">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Enterprise Invoices ({invoices.length} Statements)
          </span>
        </div>

        <div className="emc-table-container">
          <table className="emc-table">
            <thead>
              <tr>
                <th className="emc-th">Invoice Number</th>
                <th className="emc-th">Enterprise Tenant</th>
                <th className="emc-th">Amount</th>
                <th className="emc-th">Status</th>
                <th className="emc-th">Issue Date</th>
                <th className="emc-th">Due Date</th>
                <th className="emc-th">Settlement Method</th>
                <th className="emc-th" style={{ textAlign: 'right' }}>PDF Receipt</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="emc-tr">
                  <td className="emc-td emc-td-mono" style={{ fontWeight: 600, color: 'var(--text-accent)' }}>
                    {inv.number}
                  </td>
                  <td className="emc-td" style={{ fontWeight: 500 }}>
                    {inv.organizationName}
                  </td>
                  <td className="emc-td emc-td-mono">
                    ${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="emc-td">
                    <span className={`badge ${inv.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="emc-td emc-td-mono">{inv.issueDate}</td>
                  <td className="emc-td emc-td-mono">{inv.dueDate}</td>
                  <td className="emc-td" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inv.paymentMethod}
                  </td>
                  <td className="emc-td" style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() =>
                        addToast({
                          type: 'info',
                          title: 'Downloading Statement',
                          message: `Downloaded PDF for ${inv.number}.`
                        })
                      }
                    >
                      <Download size={12} /> PDF
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
