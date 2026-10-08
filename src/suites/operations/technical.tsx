import React from 'react';
import { RotateCcw } from 'lucide-react';
import { MaintenanceExtProvider, useMaintenanceExt } from './maintenance/store';
import { ProjectsProvider, useProjects } from './maintenance/projects';
import { FleetExtProvider, useFleetExt } from './fleet/store';
import { ContainersProvider, useContainers } from './containers/store';
import { OpsActorSwitcher } from './parts';
import { useOperations } from './store';
import './technical.css';

/** Maintenance, projects, transport and container stores. Mounted inside OperationsProvider. */
export const TechnicalProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MaintenanceExtProvider>
    <ProjectsProvider>
      <FleetExtProvider>
        <ContainersProvider>{children}</ContainersProvider>
      </FleetExtProvider>
    </ProjectsProvider>
  </MaintenanceExtProvider>
);

/** Sidebar footer for Maintenance and Fleet: persona switcher and a reset that restores every related store. */
export const TechFooter: React.FC = () => {
  const ops = useOperations();
  const m = useMaintenanceExt();
  const p = useProjects();
  const f = useFleetExt();
  const c = useContainers();
  return (
    <div className="sx-side-actor">
      <OpsActorSwitcher />
      <button
        type="button"
        className="sx-link sx-reset"
        onClick={() => {
          ops.reset();
          m.reset();
          p.reset();
          f.reset();
          c.reset();
        }}
      >
        <RotateCcw size={12} /> Reset demo data
      </button>
    </div>
  );
};
