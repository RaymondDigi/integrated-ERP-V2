/* Small building blocks shared by the People & Payroll panels of the portal. */
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ESS_EMPLOYEE } from './essData';

export type PillTone = 'success' | 'primary' | 'info' | 'warning' | 'critical';

export const Pill: React.FC<{ tone: PillTone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span className={`digicraft-status-pill ${tone}`} title={title}>
    {children}
  </span>
);

/** Engine tones use 'danger'; the pill styles call it 'critical'. */
export const pillTone = (t: string): PillTone => (t === 'danger' ? 'critical' : (t as PillTone));

/** Progress bar of named steps; `at` is the index of the last step reached (-1 = none). */
export const Steps: React.FC<{ steps: string[]; at: number; label?: string }> = ({ steps, at, label }) => (
  <div className="ess-steps ess-steps-n" style={{ '--ess-steps': steps.length } as React.CSSProperties} aria-label={label}>
    {steps.map((s, i) => (
      <span key={s} className={i <= at ? 'done' : ''}>
        {s}
      </span>
    ))}
  </div>
);

/** Shows the first few items with a "Show all" toggle, to keep long lists short. */
export const Capped = <T,>({ items, render, cap = 5, noun = 'items' }: { items: T[]; render: (x: T) => React.ReactNode; cap?: number; noun?: string }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, cap);
  return (
    <>
      <ul className="ess-request-list">{shown.map(render)}</ul>
      {items.length > cap && (
        <button type="button" className="ess-link ess-show-all" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length} ${noun}`}
        </button>
      )}
    </>
  );
};

/** The signed-in employee's record and company, plus whether HR has another company selected. */
export const useEssMe = () => {
  const { hrEmployees, selectedOrgId, setSelectedOrgId, organizations, tenantOrganizations } = useApp();
  const record = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
  const orgId = record?.orgId ?? selectedOrgId;
  const orgName = tenantOrganizations.find((o) => o.id === orgId)?.name ?? organizations.find((o) => o.id === orgId)?.name ?? orgId;
  return { record, orgId, orgName, otherOrg: selectedOrgId !== orgId, showMyOrg: () => setSelectedOrgId(orgId), hrEmployees };
};

/** Note shown when the app is set to another company, so Finance updates on company-scoped lists don't show. */
export const OtherCompanyNote: React.FC = () => {
  const me = useEssMe();
  if (!me.otherOrg) return null;
  return (
    <p className="ess-hint ess-org-note">
      The app is set to another company, so the latest updates from Finance on your trips and advances may not show here.{' '}
      <button type="button" className="ess-link" onClick={me.showMyOrg}>
        Switch to {me.orgName}
      </button>
    </p>
  );
};

export const ReqError: React.FC<{ text?: string }> = ({ text }) => (text ? <div className="req-error">{text}</div> : null);
