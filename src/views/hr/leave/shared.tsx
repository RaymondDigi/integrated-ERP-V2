import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { LeaveRequest } from '../../../types';
import type { LedgerTxn } from '../../../data/leaveEngine';

export const fmtDate = (iso?: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', opts) : '—';

export const fmtShort = (iso?: string) => fmtDate(iso, { day: 'numeric', month: 'short' });

/** 2 decimals at most, no trailing zeros. */
export const fmtNum = (n: number) => String(Math.round(n * 100) / 100);
export const fmtDays = (n: number) => `${fmtNum(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
export const signed = (n: number) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));

export const STATUS_PILL: Record<LeaveRequest['status'], { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Pending', cls: 'warning' },
  APPROVED: { label: 'Approved', cls: 'success' },
  REJECTED: { label: 'Declined', cls: 'danger critical' },
  CANCELLED: { label: 'Cancelled', cls: 'info' }
};

export const TXN_LABEL: Record<LedgerTxn, string> = {
  OPENING: 'Opening',
  GRANT: 'Grant',
  ACCRUAL: 'Accrual',
  CARRY_FORWARD: 'Carry-forward',
  HOLIDAY_AWARD: 'Holiday award',
  ADJUSTMENT: 'Adjustment',
  RESERVED: 'Reserved',
  TAKEN: 'Taken',
  CANCELLED: 'Cancelled',
  FORFEIT: 'Forfeit',
  ENCASHMENT: 'Encashment'
};

export const StatusPill: React.FC<{ status: LeaveRequest['status'] }> = ({ status }) => (
  <span className={`digicraft-status-pill ${STATUS_PILL[status].cls}`}>{STATUS_PILL[status].label}</span>
);

/** Supervisor → HR chain with the step each request is on. */
export const ApprovalChain: React.FC<{ request: LeaveRequest; steps: ('SUPERVISOR' | 'HR')[] }> = ({ request, steps }) => {
  const history = request.approvals ?? [];
  const current = request.currentStep ?? 'SUPERVISOR';
  return (
    <span className="lv-chain">
      {steps.map((s, i) => {
        const acted = [...history].reverse().find((a) => a.step === s && (a.action === 'APPROVED' || a.action === 'REJECTED'));
        let cls = '';
        if (acted?.action === 'REJECTED') cls = 'rejected';
        else if (acted?.action === 'APPROVED') cls = 'done';
        else if (request.status === 'PENDING_APPROVAL' && current === s) cls = 'current';
        else if (request.status === 'APPROVED') cls = 'done';
        return (
          <React.Fragment key={s}>
            {i > 0 && <span className="lv-chain-arrow">→</span>}
            <span className={`lv-step ${cls}`} title={acted ? `${acted.by}, ${fmtDate(acted.at)}` : undefined}>
              {s === 'SUPERVISOR' ? 'Supervisor' : 'HR'}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
};

export const Messages: React.FC<{ errors?: string[]; warnings?: string[]; ok?: string; info?: string[] }> = ({ errors = [], warnings = [], ok, info = [] }) => {
  if (!errors.length && !warnings.length && !ok && !info.length) return null;
  return (
    <ul className="lv-msgs">
      {errors.map((m) => (
        <li key={`e-${m}`} className="lv-msg error">
          <AlertCircle size={14} /> {m}
        </li>
      ))}
      {warnings.map((m) => (
        <li key={`w-${m}`} className="lv-msg warn">
          <AlertTriangle size={14} /> {m}
        </li>
      ))}
      {info.map((m) => (
        <li key={`i-${m}`} className="lv-msg info">
          <Info size={14} /> {m}
        </li>
      ))}
      {ok && !errors.length && (
        <li className="lv-msg ok">
          <CheckCircle2 size={14} /> {ok}
        </li>
      )}
    </ul>
  );
};

const useEscape = (onClose: () => void) =>
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

interface PanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const Modal: React.FC<PanelProps & { size?: 'md' | 'lg' | 'xl' }> = ({ title, subtitle, onClose, footer, children, size = 'lg' }) => {
  useEscape(onClose);
  return (
    <div className="sx-overlay sx-overlay-center" style={{ zIndex: 1000 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sx-modal sx-modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sx-drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="sx-modal-body">{children}</div>
        {footer && <div className="sx-drawer-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const Drawer: React.FC<PanelProps> = ({ title, subtitle, onClose, footer, children }) => {
  useEscape(onClose);
  return (
    <div className="sx-overlay" style={{ zIndex: 1000 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-drawer wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sx-drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="sx-drawer-body">{children}</div>
        {footer && <div className="sx-drawer-foot">{footer}</div>}
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string; hint?: string }> = ({ label, children, className, hint }) => (
  <label className={`req-field ${className ?? ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small className="lv-muted">{hint}</small>}
  </label>
);

export const Figure: React.FC<{ label: string; value: React.ReactNode; sub?: string; tone?: 'warn' | 'bad' }> = ({ label, value, sub, tone }) => (
  <div className={`lv-figure ${tone ?? ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
  </div>
);
