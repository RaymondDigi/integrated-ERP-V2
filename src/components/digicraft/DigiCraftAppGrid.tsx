import React, { useState, useMemo } from 'react';
import {
  ClipboardList,
  UserCheck,
  ShieldAlert,
  Users,
  Clock,
  CalendarDays,
  Coins,
  Award,
  GraduationCap,
  Scale,
  HardHat,
  FileCheck,
  Search,
  ArrowRight,
  Building2,
  ChevronRight,
  SlidersHorizontal,
  UserCircle,
  Wallet,
  Plane,
  HeartHandshake,
  Inbox
} from 'lucide-react';
import { useApp, NavigationTarget } from '../../context/AppContext';
import { HR_PROCESS_APPS } from '../../data/hrMockData';
import { HRProcessCategory } from '../../types';
import { GuidedAiIntelligence } from './GuidedAiIntelligence';
import { HR_GUIDE_STEPS } from '../../utils/guideSteps';

export const DigiCraftAppGrid: React.FC = () => {
  const {
    setCurrentView,
    activeTenant,
    tenantRequisitions,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HRProcessCategory | 'All'>('All');

  // Guided AI Intelligence States
  const [activeTourStep, setActiveTourStep] = useState<number | null>(null);
  const [showStartHerePopover, setShowStartHerePopover] = useState<boolean>(true);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  // Map icon strings to Lucide components
  const renderAppIcon = (iconName: string, size = 24) => {
    switch (iconName) {
      case 'ClipboardList':
        return <ClipboardList size={size} />;
      case 'UserCheck':
        return <UserCheck size={size} />;
      case 'ShieldAlert':
        return <ShieldAlert size={size} />;
      case 'Users':
        return <Users size={size} />;
      case 'Clock':
        return <Clock size={size} />;
      case 'CalendarDays':
        return <CalendarDays size={size} />;
      case 'Coins':
        return <Coins size={size} />;
      case 'Award':
        return <Award size={size} />;
      case 'GraduationCap':
        return <GraduationCap size={size} />;
      case 'Scale':
        return <Scale size={size} />;
      case 'HardHat':
        return <HardHat size={size} />;
      case 'FileCheck':
        return <FileCheck size={size} />;
      case 'HeartHandshake':
        return <HeartHandshake size={size} />;
      case 'Plane':
        return <Plane size={size} />;
      default:
        return <ClipboardList size={size} />;
    }
  };

  // Curated modern vibrant gradients for each app card
  const getAppGradient = (step: number) => {
    switch (step) {
      case 1:
        return 'linear-gradient(135deg, #2f8f6a, #1a5f45)'; // Requisition: Blue
      case 2:
        return 'linear-gradient(135deg, #8b5cf6, #6d28d9)'; // Recruitment: Purple
      case 3:
        return 'linear-gradient(135deg, #06b6d4, #0891b2)'; // Onboarding: Cyan
      case 4:
        return 'linear-gradient(135deg, #10b981, #059669)'; // Employees: Emerald
      case 5:
        return 'linear-gradient(135deg, #f59e0b, #d97706)'; // Attendance: Amber
      case 6:
        return 'linear-gradient(135deg, #14b8a6, #0d9488)'; // Leave: Teal
      case 7:
        return 'linear-gradient(135deg, #22c55e, #15803d)'; // Payroll: Green
      case 8:
        return 'linear-gradient(135deg, #ec4899, #be185d)'; // Performance: Pink
      case 9:
        return 'linear-gradient(135deg, #153e33, #4338ca)'; // Training: Indigo
      case 10:
        return 'linear-gradient(135deg, #ef4444, #b91c1c)'; // Disciplinary & Sec 37: Red
      case 11:
        return 'linear-gradient(135deg, #f97316, #c2410c)'; // OSH: Orange
      case 12:
        return 'linear-gradient(135deg, #64748b, #334155)'; // Separation: Slate
      case 13:
        return 'linear-gradient(135deg, #e11d48, #9f1239)'; // Relations & welfare: Rose
      case 14:
        return 'linear-gradient(135deg, #0ea5e9, #0369a1)'; // Travel: Sky
      default:
        return 'linear-gradient(135deg, #237857, #1a5f45)';
    }
  };

  // Filter apps by category and search term
  const filteredApps = useMemo(() => {
    return HR_PROCESS_APPS.filter((app) => {
      const matchesCategory = selectedCategory === 'All' || app.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.fullDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `#0${app.stepNumber}`.includes(searchQuery) ||
        `#${app.stepNumber}`.includes(searchQuery);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const categories: Array<HRProcessCategory | 'All'> = [
    'All',
    'Talent Acquisition',
    'Core HR & Time',
    'Payroll & Statutory',
    'Talent Growth',
    'Governance & Safety'
  ];

  return (
    <div className="digicraft-container">
      {/* Hero Banner */}
      <div className="digicraft-hero">
        <div className="digicraft-hero-top">
          <div className="digicraft-title-group">
            <h1>
              <span>Integrated Workforce</span>
              <span className="digicraft-badge-light">HR & Operations Cloud</span>
            </h1>
            <p className="digicraft-subtitle">
              Enterprise Human Capital Management & Employee Payroll Suite. Applications are arranged in sequential order of HR process lifecycle—from talent requisition through payroll to terminal separation.
            </p>
          </div>

          <div className="digicraft-tenant-badge">
            <Building2 size={16} className="text-accent" />
            <span>
              <strong>Tenant:</strong> {activeTenant.name} ({activeTenant.code})
            </span>
            <span style={{ color: 'var(--border-emphasis)' }}>|</span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>● Scope Isolated</span>
          </div>
        </div>

        {/* Guided AI Intelligence & Start Here Compass */}
        <GuidedAiIntelligence
          activeTourStep={activeTourStep}
          setActiveTourStep={setActiveTourStep}
          showStartHerePopover={showStartHerePopover}
          setShowStartHerePopover={setShowStartHerePopover}
          onLaunchStep={(target) => setCurrentView(target)}
          hoveredStep={hoveredStep}
        />

        {/* Employee Self-Service entry */}
        <button className="ess-launch-card" onClick={() => setCurrentView('ess')}>
          <span className="ess-launch-icon">
            <UserCircle size={26} />
          </span>
          <span className="ess-launch-text">
            <span className="ess-launch-title">
              My Employee Portal <span className="digicraft-badge-light">ESS</span>
            </span>
            <span className="ess-launch-sub">
              Apply for leave, download payslips, clock in, raise requests and update your details.
            </span>
          </span>
          <span className="ess-launch-chips" aria-hidden="true">
            <span><Plane size={13} /> Leave</span>
            <span><Wallet size={13} /> Payslips</span>
            <span><Inbox size={13} /> Requests</span>
          </span>
          <span className="ess-launch-cta">
            Open portal <ArrowRight size={15} />
          </span>
        </button>

        {/* Process Flow Ribbon Strip */}
        <div className="process-flow-container">
          <div className="process-flow-header">
            <span className="process-flow-title">
              <SlidersHorizontal size={14} />
              Human Resources Process Lifecycle (Chronological Sequence)
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Click any stage to launch specific application
            </span>
          </div>

          <div className="process-flow-steps">
            {HR_PROCESS_APPS.map((app, idx) => (
              <React.Fragment key={app.id}>
                <button
                  className={`process-flow-step ${app.stepNumber === 1 ? 'border-primary' : ''} ${activeTourStep === app.stepNumber ? 'btn-tour-active' : ''}`}
                  onClick={() => setCurrentView(app.id as NavigationTarget)}
                  title={`Step ${app.stepNumber}: ${app.name} - ${app.shortDesc}`}
                >
                  <span className="process-step-num">{app.stepNumber}</span>
                  <span>{app.name.split(' ')[0]}</span>
                  {app.stepNumber === 1 && (
                    <span className="ribbon-start-pill">Start Here</span>
                  )}
                </button>
                {idx < HR_PROCESS_APPS.length - 1 && (
                  <ChevronRight size={12} className="process-step-arrow" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Toolbar: Search & Category Filter Pills */}
        <div className="digicraft-toolbar">
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input
              type="text"
              placeholder="Search HR apps, processes, or step numbers... (e.g., 'Payroll', 'Leave', '01')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="digicraft-filter-pills">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`digicraft-filter-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'All' ? 'All Processes (12)' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DigiCraft App Cards Grid */}
      <div className="digicraft-app-grid">
        {filteredApps.map((app) => {
          const stepInfo = HR_GUIDE_STEPS[app.stepNumber];
          const isHovered = hoveredStep === app.stepNumber;
          const isStartHere = app.stepNumber === 1;
          const isTourActive = activeTourStep === app.stepNumber;

          return (
            <div
              key={app.id}
              id={`digicraft-card-${app.stepNumber}`}
              className={`digicraft-app-card ${isStartHere ? 'card-start-here' : ''} ${isTourActive ? 'card-tour-spotlight' : ''}`}
              onClick={() => setCurrentView(app.id as NavigationTarget)}
              onMouseEnter={() => setHoveredStep(app.stepNumber)}
              onMouseLeave={() => setHoveredStep(null)}
              role="button"
              tabIndex={0}
              title={`Launch ${app.name} (Step #${String(app.stepNumber).padStart(2, '0')} • ${app.category})`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCurrentView(app.id as NavigationTarget);
                }
              }}
            >
              {/* Pulsing "START HERE" badge on Step 1 */}
              {isStartHere && (
                <div className="badge-start-here">
                  <span>👉 START HERE</span>
                </div>
              )}

              <div className="digicraft-card-top">
                <span className="digicraft-step-badge">
                  #{String(app.stepNumber).padStart(2, '0')}
                </span>
              </div>

              <div
                className="digicraft-app-icon"
                style={{ background: getAppGradient(app.stepNumber) }}
              >
                {renderAppIcon(app.iconName, 26)}
              </div>

              <div className="digicraft-card-body">
                <h3 className="digicraft-card-title">{app.name}</h3>
                <span className="digicraft-card-category">{app.category}</span>
              </div>

              {/* Guided AI Hover Popup Preview */}
              {isHovered && !isTourActive && !showStartHerePopover && stepInfo && (
                <div className="ai-hover-popup" role="tooltip">
                  <div className="hover-header-row">
                    <span className="hover-step-tag">
                      {isStartHere ? 'Start Here • Step 01' : `Stage ${String(app.stepNumber).padStart(2, '0')} / 12`}
                    </span>
                    <span className="hover-category">{stepInfo.category}</span>
                  </div>
                  <div className="hover-title">{stepInfo.name}</div>
                  <div className="hover-explanation">{stepInfo.aiExplanation}</div>
                  <div className="hover-footer">
                    <span>{stepInfo.keyOutputs[0]}</span>
                    <span className="hover-click-cue">
                      Launch ➜
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Operational Highlights Strip */}
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Active Organization Workforce</div>
          <div className="hr-stat-value">{activeTenant.employeeCount} Personnel</div>
          <div className="hr-stat-subtext">{activeTenant.name} ({activeTenant.entityType})</div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-label">Pending Requisitions</div>
          <div className="hr-stat-value">
            {tenantRequisitions.filter((r) => r.status === 'PENDING_APPROVAL').length} Positions
          </div>
          <div className="hr-stat-subtext">Establishment budget quota for current entity</div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-label">Current Payroll Commitment</div>
          <div className="hr-stat-value">KES {(activeTenant.activePayrollBatchKes / 1000000).toFixed(2)}M</div>
          <div className="hr-stat-subtext">Monthly bank EFT + weekly M-Pesa B2C runs</div>
        </div>

        <div className="hr-stat-card">
          <div className="hr-stat-label">Statutory Compliance</div>
          <div className="hr-stat-value" style={{ color: '#10b981' }}>{activeTenant.complianceRating}</div>
          <div className="hr-stat-subtext">KRA PAYE • NSSF I & II • SHIF 2.75% • AHL 1.5%</div>
        </div>
      </div>
    </div>
  );
};

