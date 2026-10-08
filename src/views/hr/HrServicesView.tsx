import React from 'react';
import { HeartHandshake } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { HireHeader, useModuleTab } from './hire/shared';
import { CsrEventsTab, LibraryTab, MedicalCoverTab, OutsourcedTab, SERVICE_TABS, TravelTab, WelfareTab } from './hcm/ServicesTabs';

/** Staff welfare & services: welfare benefits, medical cover, travel and imprest, CSR and events, outsourced labour and the library. */
export const HrServicesView: React.FC = () => {
  const { activeTenant } = useApp();
  const [tab] = useModuleTab('hr-services', 'welfare');
  return (
    <div className="hr-app-view hi-view">
      <HireHeader
        step="13"
        title="Staff Welfare & Services"
        subtitle={`${activeTenant.name}: welfare benefits, medical cover, travel and imprest, CSR and staff events, outsourced labour and the staff library.`}
        icon={HeartHandshake}
        gradient="linear-gradient(135deg, #db2777, #9d174d)"
        view="hr-services"
        tabs={SERVICE_TABS}
        next={{ label: 'Go to Employee Master (#04)', view: 'employees' }}
      />
      {tab === 'medical' ? <MedicalCoverTab /> : tab === 'travel' ? <TravelTab /> : tab === 'csr' ? <CsrEventsTab /> : tab === 'outsourced' ? <OutsourcedTab /> : tab === 'library' ? <LibraryTab /> : <WelfareTab />}
    </div>
  );
};
