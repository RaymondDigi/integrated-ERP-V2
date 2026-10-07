import React from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'warning'
            ? AlertTriangle
            : toast.type === 'error'
            ? AlertOctagon
            : Info;

        const iconColor =
          toast.type === 'success'
            ? 'var(--status-success)'
            : toast.type === 'warning'
            ? 'var(--status-warning)'
            : toast.type === 'error'
            ? 'var(--status-critical)'
            : 'var(--brand-primary)';

        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <Icon size={18} color={iconColor} style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="toast-content" style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h5>{toast.title}</h5>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {toast.timestamp}
                </span>
              </div>
              <p>{toast.message}</p>
            </div>
            <button
              className="btn-ghost"
              onClick={() => removeToast(toast.id)}
              style={{ padding: 2, borderRadius: 3, cursor: 'pointer', border: 'none', background: 'transparent' }}
              title="Dismiss notification"
            >
              <X size={14} color="var(--text-secondary)" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
