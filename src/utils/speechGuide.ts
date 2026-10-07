// ========================================================
// Guided AI Voice Intelligence & Speech Synthesis Engine
// ========================================================

export interface StepGuideScript {
  stepNumber: number;
  id: string;
  name: string;
  shortTag: string;
  speechText: string;
  subtitles: string;
}

export const WELCOME_SCRIPT = {
  title: 'Welcome to Integrated Workforce',
  speechText:
    "Welcome to Integrated Workforce. Let's get you oriented. To begin, Start Here at Step 1: Employee Requisition. This is where you establish approved headcount quotas before initiating recruitment. You can launch Step 1 now, or let me guide you through the 12-stage human capital lifecycle.",
  subtitles:
    "Welcome to Integrated Workforce. Start Here at Step 1: Employee Requisition to establish approved headcount quotas before recruiting, or take the guided tour."
};

export const STEP_SCRIPTS: Record<number, StepGuideScript> = {
  1: {
    stepNumber: 1,
    id: 'employee-requisition',
    name: 'Employee Requisition',
    shortTag: 'START HERE • Quota & Approvals',
    speechText:
      "Step 1: Employee Requisition. This is your primary starting point. Here, department leads submit hiring requisitions checked automatically against approved establishment quotas and multi-tier executive approval workflows.",
    subtitles:
      "Step 1: Employee Requisition (START HERE) — Submit hiring requests validated against establishment quota limits."
  },
  2: {
    stepNumber: 2,
    id: 'recruitment',
    name: 'Recruitment & Pipeline',
    shortTag: 'Talent Acquisition • Scoring',
    speechText:
      "Step 2: Recruitment and Candidate Pipeline. Manage applicant funnels, conduct online aptitude scoring, and record weighted multi-panel interview rubrics with instant candidate ranking.",
    subtitles:
      "Step 2: Recruitment & Pipeline — Candidate sourcing, scoring rubrics, and interview panel evaluations."
  },
  3: {
    stepNumber: 3,
    id: 'onboarding',
    name: 'Pre-Employment & Induction',
    shortTag: 'KYC Checks • Safety Kit',
    speechText:
      "Step 3: Pre-Employment and Induction. Verify statutory identity, validate KRA, NSSF, and SHIF credentials, issue digital offer letters, and assign biometric credentials and safety kit gear.",
    subtitles:
      "Step 3: Induction & Compliance — Statutory KYC verification, digital policy sign-offs, and kit issuance."
  },
  4: {
    stepNumber: 4,
    id: 'employees',
    name: 'Employee Master & Org',
    shortTag: 'Central Vault • Visual Org Chart',
    speechText:
      "Step 4: Employee Master Directory. Your encrypted repository for all workforce profiles, contract classifications, compensation bands, and visual multi-tier organizational reporting trees.",
    subtitles:
      "Step 4: Employee Master — Encrypted personnel records, contract terms, and dynamic organizational trees."
  },
  5: {
    stepNumber: 5,
    id: 'attendance',
    name: 'Biometric Attendance & Muster',
    shortTag: 'IoT Clock-ins • GPS Geofencing',
    speechText:
      "Step 5: Biometric Attendance and Muster. Ingest real-time clock-in streams from IoT biometric gate turnstiles, GPS polygon geofences, and production output tallies.",
    subtitles:
      "Step 5: Biometric Muster — Real-time clock-in telemetry, geofenced mobile muster, and output tallies."
  },
  6: {
    stepNumber: 6,
    id: 'leave',
    name: 'Leave & Absence',
    shortTag: 'Balance Accruals • Workflow',
    speechText:
      "Step 6: Leave and Absence Management. Self-service annual, sick, and maternity leave applications, supervisory multi-stage approvals, and automated statutory leave allowance payroll sync.",
    subtitles:
      "Step 6: Leave & Absence — Self-service requests, balance tracking, and automated payroll allowance integrations."
  },
  7: {
    stepNumber: 7,
    id: 'payroll',
    name: 'Employee Payroll',
    shortTag: 'M-Pesa B2C • 2026 Tax Engine',
    speechText:
      "Step 7: Employee Payroll. Run weekly payroll batches with instant M-Pesa B2C disbursements and monthly payroll bank EFT batches by contract pay frequency, fully compliant with 2026 KRA, NSSF, SHIF, and housing levy rates.",
    subtitles:
      "Step 7: Employee Payroll — Disburse weekly M-Pesa batches and monthly bank EFT runs by pay frequency with 2026 statutory deductions."
  },
  8: {
    stepNumber: 8,
    id: 'performance',
    name: 'Performance & OKR',
    shortTag: 'Balanced Scorecard • 9-Box Matrix',
    speechText:
      "Step 8: Performance and OKRs. Align corporate objectives to individual balanced scorecards, plot talent along the 9-box succession matrix, and calculate automated merit bonus tiers.",
    subtitles:
      "Step 8: Performance & OKR — Balanced scorecards, 9-box talent matrix, and merit bonus calculations."
  },
  9: {
    stepNumber: 9,
    id: 'training',
    name: 'Learning & Skills Matrix',
    shortTag: 'Mandatory Certs • Skills Gaps',
    speechText:
      "Step 9: Learning and Skills Matrix. Audit corporate skills gap heatmaps, monitor 6-month statutory food handler medical certifications, and renew boiler engineering permits.",
    subtitles:
      "Step 9: Learning & Skills Matrix — Mandatory safety certs, skills heatmaps, and license renewal tracking."
  },
  10: {
    stepNumber: 10,
    id: 'disciplinary',
    name: 'Contract Compliance & Disciplinary',
    shortTag: 'Service Threshold Monitor • Disciplinary Hearings',
    speechText:
      "Step 10: Contract Compliance and Disciplinary Governance. Monitors employees against the service threshold defined by their contract type, with one-click contract type change, alongside formal disciplinary hearings.",
    subtitles:
      "Step 10: Contract Compliance Governance — Automated service threshold monitor and disciplinary hearings."
  },
  11: {
    stepNumber: 11,
    id: 'osh-security',
    name: 'OSH & Gate Security',
    shortTag: 'Permit-to-Work • DOSHS Form 1',
    speechText:
      "Step 11: Occupational Safety, Health, and Gate Security. Issue digital permits for hazardous work, submit statutory DOSHS accident filings, and log NFC checkpoint security patrols.",
    subtitles:
      "Step 11: OSH & Security — Digital permits to work, statutory DOSHS compliance, and NFC gate patrols."
  },
  12: {
    stepNumber: 12,
    id: 'separation',
    name: 'Separation & Terminal Benefits',
    shortTag: 'Clearance Matrix • Gratuity Calculation',
    speechText:
      "Step 12: Separation and Offboarding. Orchestrate department clearance handoffs, compute terminal gratuity and statutory severance, and issue verifiable certificates of service.",
    subtitles:
      "Step 12: Separation & Offboarding — Multi-department clearances, gratuity computations, and certificates of service."
  }
};

export class SpeechGuideController {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isMuted: boolean = false;
  private speechRate: number = 1.0;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private onStateChangeCallback: ((state: { isSpeaking: boolean; isPaused: boolean; text: string; stepNumber?: number }) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    // Prioritize natural sounding English voices
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const preferred =
      enVoices.find(v => v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Jenny') || v.name.includes('Samantha')) ||
      enVoices[0] ||
      voices[0];
    this.preferredVoice = preferred || null;
  }

  public setOnStateChange(cb: (state: { isSpeaking: boolean; isPaused: boolean; text: string; stepNumber?: number }) => void) {
    this.onStateChangeCallback = cb;
  }

  public isSupported(): boolean {
    return !!this.synth;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.synth && this.synth.speaking) {
      this.synth.cancel();
      this.emitState(false, false, '');
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setRate(rate: number) {
    this.speechRate = rate;
  }

  public getRate(): number {
    return this.speechRate;
  }

  public speak(text: string, subtitleText?: string, stepNumber?: number) {
    if (!this.synth) {
      // If Web Speech is unsupported, still trigger UI subtitle feedback
      this.emitState(true, false, subtitleText || text, stepNumber);
      setTimeout(() => this.emitState(false, false, '', stepNumber), 4000);
      return;
    }

    this.stop();

    if (this.isMuted) {
      // When muted, display subtitle feedback without voice sound
      this.emitState(true, false, subtitleText || text, stepNumber);
      setTimeout(() => this.emitState(false, false, '', stepNumber), 4000);
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.preferredVoice) {
        utterance.voice = this.preferredVoice;
      }
      utterance.rate = this.speechRate;
      utterance.pitch = 1.02;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        this.emitState(true, false, subtitleText || text, stepNumber);
      };

      utterance.onend = () => {
        this.emitState(false, false, '', stepNumber);
        this.currentUtterance = null;
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis event error:', e);
        this.emitState(false, false, '', stepNumber);
        this.currentUtterance = null;
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis call failed:', err);
      this.emitState(false, false, '', stepNumber);
    }
  }

  public pause() {
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
      this.emitState(true, true, this.currentUtterance?.text || '');
    }
  }

  public resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
      this.emitState(true, false, this.currentUtterance?.text || '');
    }
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
    this.emitState(false, false, '');
  }

  private emitState(isSpeaking: boolean, isPaused: boolean, text: string, stepNumber?: number) {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ isSpeaking, isPaused, text, stepNumber });
    }
  }
}

// Global singleton instance for easy access across the landing page
export const speechGuide = new SpeechGuideController();
