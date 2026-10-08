import React, { useState } from 'react';
import { UserCheck, Briefcase, Users, CalendarClock, FileSignature, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { HireHeader, useModuleTab, type TabDef } from './hire/shared';
import { VacanciesTab, PipelineTab, InterviewsTab, OffersTab, InsightsTab } from './hire/RecruitmentTabs';
import { AptitudeTestsTab, CareersPortalTab } from './hcm/TalentTabs';
import { ClipboardCheck, Globe } from 'lucide-react';

const TABS: TabDef[] = [
  { id: 'vacancies', label: 'Vacancies', icon: Briefcase },
  { id: 'pipeline', label: 'Applicant pipeline', icon: Users },
  { id: 'interviews', label: 'Interviews & scorecards', icon: CalendarClock },
  { id: 'offers', label: 'Offers', icon: FileSignature },
  { id: 'insights', label: 'Hiring statistics', icon: BarChart3 },
  { id: 'tests', label: 'Aptitude tests', icon: ClipboardCheck },
  { id: 'careers', label: 'Careers portal', icon: Globe }
];

export const RecruitmentView: React.FC = () => {
  const { activeTenant } = useApp();
  const [tab, setTab] = useModuleTab('recruitment', 'vacancies');
  const [vacancyId, setVacancyId] = useState('All');

  return (
    <div className="hr-app-view hi-view">
      <HireHeader
        step="02"
        title="Recruitment & Candidate Pipeline"
        subtitle={`${activeTenant.name}: vacancies from approved requisitions, knock-out screening, panel scorecards, checks and offers within the grade band.`}
        icon={UserCheck}
        gradient="linear-gradient(135deg, #8b5cf6, #6d28d9)"
        view="recruitment"
        tabs={TABS}
        next={{ label: 'Go to Onboarding (#03)', view: 'onboarding' }}
      />
      {tab === 'tests' ? (
        <AptitudeTestsTab />
      ) : tab === 'careers' ? (
        <CareersPortalTab />
      ) : tab === 'pipeline' ? (
        <PipelineTab vacancyId={vacancyId} setVacancyId={setVacancyId} />
      ) : tab === 'interviews' ? (
        <InterviewsTab />
      ) : tab === 'offers' ? (
        <OffersTab />
      ) : tab === 'insights' ? (
        <InsightsTab />
      ) : (
        <VacanciesTab
          onPipeline={(id) => {
            setVacancyId(id);
            setTab('pipeline');
          }}
        />
      )}
    </div>
  );
};
