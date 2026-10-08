import React, { createContext, useCallback, useContext, useState } from 'react';

export type WorkflowsPage = 'inbox' | 'rules' | 'activity' | 'intranet' | 'documents' | 'knowledge' | 'calendar' | 'surveys' | 'helpdesk';
export type ExecutivePage = 'overview' | 'analytics' | 'mine' | 'alerts' | 'reports' | 'forecasts' | 'manufacturing' | 'dataquality';

const Ctx = createContext<{
  workflows: WorkflowsPage;
  executive: ExecutivePage;
  setWorkflows: (p: WorkflowsPage) => void;
  setExecutive: (p: ExecutivePage) => void;
} | null>(null);

/** Page state for the cross-module views (Approval Center, Business Overview). */
export const HubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workflows, setW] = useState<WorkflowsPage>('inbox');
  const [executive, setE] = useState<ExecutivePage>('overview');
  return (
    <Ctx.Provider value={{ workflows, executive, setWorkflows: useCallback((p: WorkflowsPage) => setW(p), []), setExecutive: useCallback((p: ExecutivePage) => setE(p), []) }}>
      {children}
    </Ctx.Provider>
  );
};

export const useHub = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHub must be used inside HubProvider');
  return ctx;
};
