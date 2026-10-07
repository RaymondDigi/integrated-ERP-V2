import React from 'react';
import { ShieldAlert, UserPlus, ListChecks, Presentation, BadgeCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { HireHeader, useModuleTab, type TabDef } from './hire/shared';
import { HiresTab, TasksTab, SessionsTab, ProbationTab } from './hire/OnboardingTabs';

const TABS: TabDef[] = [
  { id: 'hires', label: 'New hires', icon: UserPlus },
  { id: 'tasks', label: 'Task board', icon: ListChecks },
  { id: 'sessions', label: 'Induction sessions', icon: Presentation },
  { id: 'probation', label: 'Probation', icon: BadgeCheck }
];

export const OnboardingView: React.FC = () => {
  const { activeTenant } = useApp();
  const [tab] = useModuleTab('onboarding', 'hires');

  return (
    <div className="hr-app-view hi-view">
      <HireHeader
        step="03"
        title="Pre-Employment & Induction"
        subtitle={`${activeTenant.name}: pre-boarding and first-90-days checklist by owner, KYC and pay details, induction attendance and probation.`}
        icon={ShieldAlert}
        gradient="linear-gradient(135deg, #06b6d4, #0891b2)"
        view="onboarding"
        tabs={TABS}
        next={{ label: 'Go to Employee Master (#04)', view: 'employees' }}
      />
      {tab === 'tasks' ? <TasksTab /> : tab === 'sessions' ? <SessionsTab /> : tab === 'probation' ? <ProbationTab /> : <HiresTab />}
    </div>
  );
};
