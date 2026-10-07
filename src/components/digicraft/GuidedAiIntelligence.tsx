import React, { useEffect, useRef } from 'react';
import {
  Sparkles,
  ArrowLeft,
  X,
  Compass,
  CheckCircle2,
  ExternalLink,
  Target,
  Lightbulb
} from 'lucide-react';
import { HR_GUIDE_STEPS, GuideStepData } from '../../utils/guideSteps';
import { NavigationTarget } from '../../context/AppContext';

interface GuidedAiIntelligenceProps {
  activeTourStep: number | null; // 1..12 or null
  setActiveTourStep: (step: number | null) => void;
  showStartHerePopover: boolean;
  setShowStartHerePopover: (show: boolean) => void;
  onLaunchStep: (target: NavigationTarget) => void;
  hoveredStep: number | null;
}

export const GuidedAiIntelligence: React.FC<GuidedAiIntelligenceProps> = ({
  activeTourStep,
  setActiveTourStep,
  showStartHerePopover,
  setShowStartHerePopover,
  onLaunchStep,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to spotlighted card when tour step changes
  useEffect(() => {
    if (activeTourStep !== null) {
      const el = document.getElementById(`digicraft-card-${activeTourStep}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (showStartHerePopover) {
      const el = document.getElementById('digicraft-card-1');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeTourStep, showStartHerePopover]);

  const currentStepData: GuideStepData | null =
    activeTourStep !== null ? HR_GUIDE_STEPS[activeTourStep] : showStartHerePopover ? HR_GUIDE_STEPS[1] : null;

  const handleNextStep = () => {
    if (showStartHerePopover) {
      setShowStartHerePopover(false);
      setActiveTourStep(2);
      return;
    }
    if (activeTourStep !== null && activeTourStep < 12) {
      setActiveTourStep(activeTourStep + 1);
    } else {
      setActiveTourStep(null);
    }
  };

  const handlePrevStep = () => {
    if (activeTourStep !== null && activeTourStep > 1) {
      setActiveTourStep(activeTourStep - 1);
    }
  };

  const handleClose = () => {
    setShowStartHerePopover(false);
    setActiveTourStep(null);
  };

  const handleTriggerStartHere = () => {
    setActiveTourStep(null);
    setShowStartHerePopover(true);
  };

  const handleStartTour = () => {
    setShowStartHerePopover(false);
    setActiveTourStep(1);
  };

  return (
    <div className="guided-ai-container">
      {/* Top Guided AI Compass Ribbon */}
      <div className="guided-ai-compass-bar">
        <div className="guided-ai-left">
          <div className="guided-ai-avatar">
            <Sparkles size={18} className="guided-ai-icon-sparkle" />
            <span className="guided-ai-pulse-dot" />
          </div>
          <div className="guided-ai-text-block">
            <div className="guided-ai-badge-row">
              <span className="guided-ai-title">Guided AI Intelligence</span>
              <span className="guided-ai-sub-badge">Process Navigator</span>
              {activeTourStep !== null && (
                <span className="guided-ai-tour-indicator">
                  Tour: Stage {activeTourStep} of 12
                </span>
              )}
            </div>
            <p className="guided-ai-guidance">
              {activeTourStep !== null
                ? `Currently exploring Stage ${activeTourStep}: ${currentStepData?.name}. Follow the sequential steps below.`
                : "New here? Start at Step 1: Employee Requisition to establish hiring quotas, or explore the 12-stage sequential lifecycle."}
            </p>
          </div>
        </div>

        <div className="guided-ai-actions">
          <button
            className="guided-ai-btn btn-start-here"
            onClick={handleTriggerStartHere}
            title="Point to where to start your operations"
          >
            <Target size={15} />
            <span>👉 Start Here (Step 1)</span>
          </button>

          <button
            className={`guided-ai-btn ${activeTourStep !== null ? 'btn-tour-active' : 'btn-tour'}`}
            onClick={activeTourStep !== null ? handleClose : handleStartTour}
            title="Walk through all 12 operational stages"
          >
            <Compass size={15} />
            <span>{activeTourStep !== null ? 'Exit Walkthrough' : 'Start 12-Stage Tour'}</span>
          </button>
        </div>
      </div>

      {/* Floating Spotlight Popover for "Start Here" or Active Tour Step */}
      {(showStartHerePopover || activeTourStep !== null) && currentStepData && (
        <div className="guided-ai-modal-overlay" onClick={handleClose}>
          <div
            className="guided-ai-popover-card"
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Popover Header */}
            <div className="popover-card-header">
              <div className="popover-header-meta">
                <span className="popover-stage-pill">
                  {currentStepData.stepNumber === 1
                    ? '👉 RECOMMENDED: START HERE'
                    : `Stage ${String(currentStepData.stepNumber).padStart(2, '0')} of 12`}
                </span>
                <span className="popover-category-tag">{currentStepData.category}</span>
              </div>
              <button
                className="popover-close-btn"
                onClick={handleClose}
                aria-label="Close Guide"
                title="Dismiss guide popup"
              >
                <X size={16} />
              </button>
            </div>

            {/* Popover Body */}
            <div className="popover-card-body">
              <div className="popover-title-row">
                <h3 className="popover-app-name">{currentStepData.name}</h3>
                <span className="popover-tagline">{currentStepData.tagline}</span>
              </div>

              {currentStepData.whyStartHere && (
                <div className="popover-why-start-box">
                  <div className="why-start-header">
                    <Lightbulb size={16} className="text-amber-400" />
                    <strong>Why Start Here?</strong>
                  </div>
                  <p>{currentStepData.whyStartHere}</p>
                </div>
              )}

              <p className="popover-explanation">{currentStepData.aiExplanation}</p>

              {/* Key Deliverables / What this stage produces */}
              <div className="popover-key-outputs">
                <div className="key-outputs-title">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>Key Outputs & Deliverables from this Stage:</span>
                </div>
                <ul className="key-outputs-list">
                  {currentStepData.keyOutputs.map((output, idx) => (
                    <li key={idx}>
                      <span className="output-bullet">●</span>
                      <span>{output}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Popover Footer with Navigation */}
            <div className="popover-card-footer">
              <div className="popover-nav-group">
                {activeTourStep !== null && activeTourStep > 1 && (
                  <button
                    className="popover-btn-nav popover-btn-prev"
                    onClick={handlePrevStep}
                  >
                    <ArrowLeft size={14} />
                    <span>Prev</span>
                  </button>
                )}

                <button
                  className="popover-btn-nav popover-btn-next"
                  onClick={handleNextStep}
                >
                  <span>
                    {showStartHerePopover
                      ? 'Continue Tour (Step 2) ➜'
                      : activeTourStep === 12
                      ? 'Finish Tour'
                      : 'Next Stage ➜'}
                  </span>
                </button>
              </div>

              <div className="popover-action-group">
                <button
                  className="popover-btn-launch"
                  onClick={() => {
                    handleClose();
                    onLaunchStep(currentStepData.actionRoute as NavigationTarget);
                  }}
                >
                  <span>Launch {currentStepData.name}</span>
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
