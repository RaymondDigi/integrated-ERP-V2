import type { HREmployee } from '../../types';
import { kinFromDrafts } from '../../utils/nextOfKin';
import React, { useMemo, useState } from 'react';
import {
  Home,
  CalendarDays,
  Wallet,
  Clock,
  Inbox,
  FolderOpen,
  UserCircle,
  ArrowLeft,
  Plane,
  FileText,
  LogIn,
  LogOut,
  Plus,
  Megaphone,
  PartyPopper,
  Users,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ClipboardCheck,
  Receipt,
  Target,
  Archive,
  Package,
  XCircle,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { LeaveRequest } from '../../types';
import {
  ESS_EMPLOYEE,
  ESS_ANNOUNCEMENTS,
  TEAM_OUT_TODAY,
  syncEssEmployee,
  buildPayslips,
  nextPayDate,
  formatKes,
  formatDate,
  workingDaysBetween,
  todayIso,
  ESS_IS_LEAVE_APPROVER,
  ESS_ACTIVE_APPRAISAL,
  ESS_ASSETS,
  INITIAL_ESS_PROFILE,
  profileFromRecord,
  type EssProfileData,
  type EssAsset,
  type EssRequest,
  type EssRequestType
} from './essData';
import { EssPayslips, EssRequests, EssDocuments, EssProfile } from './EssPanels';
import { EssAiAssistant, AiHomeCard, ProfileCompletenessCard } from './EssAi';
import { detectIssues, setAiHolidays, type AiContext, type AiAction } from './aiEngine';
import { EssApprovals, EssPerformance, EssAssets, EssDisciplinary } from './EssRecords';
import { EssP9 } from './EssP9';
import { codeOf, leaveBalances, validateLeaveRequest } from '../../data/leaveEngine';

type EssTab = 'home' | 'ai' | 'leave' | 'approvals' | 'pay' | 'performance' | 'attendance' | 'requests' | 'records' | 'profile';
type PaySub = 'payslips' | 'p9';
type RecordsSub = 'assets' | 'disciplinary' | 'documents';

const TABS: { id: EssTab; label: string; icon: React.ElementType; approverOnly?: boolean }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles },
  { id: 'leave', label: 'My Leave', icon: CalendarDays },
  { id: 'approvals', label: 'Approvals', icon: ClipboardCheck, approverOnly: true },
  { id: 'pay', label: 'Pay & P9', icon: Wallet },
  { id: 'performance', label: 'Performance', icon: Target },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'requests', label: 'Requests', icon: Inbox },
  { id: 'records', label: 'My Records', icon: Archive },
  { id: 'profile', label: 'My Profile', icon: UserCircle }
];

const SubTabs = <T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon: React.ElementType }[] }) => (
  <div className="ess-segmented ess-subtabs" role="tablist">
    {items.map((it) => {
      const Icon = it.icon;
      return (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={value === it.id ? 'active' : ''} onClick={() => onChange(it.id)}>
          <Icon size={14} /> {it.label}
        </button>
      );
    })}
  </div>
);

export interface Punch {
  time: string;
  type: 'IN' | 'OUT';
  location: string;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const timeNow = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const EssPortalView: React.FC = () => {
  const { leaveRequests, createLeaveRequest, cancelLeaveRequest, addToast, setCurrentView, hrEmployees, updateHrEmployee, logEmployeeEdit, leaveCfg, leaveHolidays, essRequests, submitEssRequest, payrollCtx, addAttendancePunch } = useApp();
  // Keep the assistant's working-day maths on the same calendar as HR (holidays for this employee's site)
  const essOrg = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId)?.orgId;
  setAiHolidays(leaveHolidays.filter((h) => h.location === 'ALL' || h.location === essOrg).map((h) => ({ date: h.observed || h.date, name: h.name })));
  const [tab, setTab] = useState<EssTab>('home');
  const [paySub, setPaySub] = useState<PaySub>('payslips');
  const [recordsSub, setRecordsSub] = useState<RecordsSub>('assets');
  const [requestDetails, setRequestDetails] = useState('');
  const [punches, setPunches] = useState<Punch[]>([]);
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);
  const [requestPreset, setRequestPreset] = useState<EssRequestType | null>(null);
  // Contact details HR edits on the employee record flow into the portal profile
  const recordForProfile = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
  const [profile, setProfile] = useState<EssProfileData>(() => ({ ...INITIAL_ESS_PROFILE, ...profileFromRecord(recordForProfile) }));
  const recordContactKey = JSON.stringify(profileFromRecord(recordForProfile));
  const [syncedContactKey, setSyncedContactKey] = useState(recordContactKey);
  if (recordContactKey !== syncedContactKey) {
    setSyncedContactKey(recordContactKey);
    setProfile((p) => ({ ...p, ...profileFromRecord(recordForProfile) }));
  }
  // What the employee changes here is saved on their employee record, so HR, payroll and notices use it too
  const saveProfile = (p: EssProfileData) => {
    setProfile(p);
    const rec = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
    if (!rec) return;
    const kin = kinFromDrafts(p.kins);
    const em = p.emName.trim() ? { name: p.emName.trim(), relationship: p.emRelationship.trim(), phone: p.emPhone.trim() } : undefined;
    const patch: Partial<HREmployee> = {
      phone: p.phone.trim(),
      personalEmail: p.personalEmail.trim() || undefined,
      address: p.address.trim() || undefined,
      maritalStatus: p.maritalStatus || undefined,
      ...kin,
      emergencyContact: em,
      photoUrl: p.photoUrl
    };
    const changed = (Object.keys(patch) as (keyof HREmployee)[]).filter((k) => JSON.stringify(rec[k] ?? null) !== JSON.stringify(patch[k] ?? null) && k !== 'nextOfKin');
    if (!changed.length) return;
    const label: Partial<Record<keyof HREmployee, string>> = { phone: 'phone', personalEmail: 'personal email', address: 'address', maritalStatus: 'marital status', nextOfKins: 'next of kin', emergencyContact: 'emergency contact', photoUrl: 'photo' };
    const summary = `Updated in self-service: ${changed.map((k) => label[k] ?? String(k)).join(', ')}`;
    updateHrEmployee(rec.staffId, { ...patch, history: [...(rec.history ?? []), { date: today, kind: 'Details updated', summary, by: `${rec.fullName} (self-service)` }] });
    logEmployeeEdit(rec.staffId, [{ action: summary }], `${rec.fullName} (self-service)`);
  };
  const [assets, setAssets] = useState<EssAsset[]>(ESS_ASSETS);
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);

  // The portal reads the same employee record and payroll as HR (promotions, posted items, loans)
  const essRecord = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
  const today = todayIso();
  const teamOut = leaveRequests
    .filter((l) => l.status === 'APPROVED' && l.approverStaffId === ESS_EMPLOYEE.staffId && l.startDate <= today && l.endDate >= today)
    .map((l) => ({ name: l.staffName, reason: l.leaveType, until: l.endDate }));
  syncEssEmployee(essRecord, payrollCtx, teamOut);
  const requests = useMemo(() => essRequests.filter((r) => r.staffId === ESS_EMPLOYEE.staffId), [essRequests]);
  const payslips = useMemo(() => buildPayslips(6), [payrollCtx, essRecord]); // eslint-disable-line react-hooks/exhaustive-deps
  const myLeave = leaveRequests
    .filter((l) => l.staffId === ESS_EMPLOYEE.staffId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const teamLeave = ESS_IS_LEAVE_APPROVER ? leaveRequests.filter((l) => l.approverStaffId === ESS_EMPLOYEE.staffId) : [];
  // Requests already past the supervisor step wait for HR, not for this approver
  const approvalsPending = teamLeave.filter((l) => l.status === 'PENDING_APPROVAL' && l.currentStep !== 'HR');
  const approvalsDecided = teamLeave
    .filter((l) => l.status === 'APPROVED' || l.status === 'REJECTED')
    .sort((a, b) => (b.decidedOn ?? '').localeCompare(a.decidedOn ?? ''));
  const assetsToAck = assets.filter((a) => !a.acknowledged).length;

  // Same ledger-derived balances as HR › Leave › Balances
  const balances = useMemo(
    () =>
      essRecord
        ? leaveBalances(essRecord, leaveRequests, todayIso(), leaveCfg)
            .filter((b) => b.eligible && b.tracked && (b.entitlement.total > 0 || b.awarded > 0))
            .map((b) => ({
              type: b.name,
              entitled: b.entitlement.total,
              total: Math.round((b.available + b.taken + b.pending) * 100) / 100,
              used: b.taken,
              pending: b.pending,
              available: b.available
            }))
        : [],
    [essRecord, leaveRequests, leaveCfg]
  );

  const clockedIn = punches.length > 0 && punches[punches.length - 1].type === 'IN';

  const handleClock = () => {
    const type = clockedIn ? 'OUT' : 'IN';
    setPunches((prev) => [...prev, { time: timeNow(), type, location: ESS_EMPLOYEE.branch }]);
    // Mobile punches go to Time & Attendance like terminal punches
    addAttendancePunch({
      staffId: ESS_EMPLOYEE.staffId,
      staffName: ESS_EMPLOYEE.fullName,
      branch: ESS_EMPLOYEE.branch,
      block: 'Portal',
      deviceId: 'ESS-MOBILE',
      type: type === 'IN' ? 'CLOCK_IN' : 'CLOCK_OUT',
      source: 'GPS_GEOFENCE',
      geofenceStatus: 'VALID_POLYGON'
    });
    addToast({
      type: 'success',
      title: type === 'IN' ? 'Clocked in' : 'Clocked out',
      message: `${type === 'IN' ? 'Clock-in' : 'Clock-out'} recorded at ${timeNow()} — ${ESS_EMPLOYEE.branch}.`
    });
  };

  const submitRequest = (r: Omit<EssRequest, 'id' | 'submittedOn' | 'status' | 'assignedTo' | 'staffId'>) => {
    submitEssRequest({ ...r, staffId: ESS_EMPLOYEE.staffId });
  };

  const openNewRequest = (preset: EssRequestType, details = '') => {
    setRequestPreset(preset);
    setRequestDetails(details);
    setTab('requests');
  };

  const goLeave = (openForm = false) => {
    setTab('leave');
    setLeaveFormOpen(openForm);
  };

  const pendingCount =
    myLeave.filter((l) => l.status === 'PENDING_APPROVAL').length +
    requests.filter((r) => r.status === 'Submitted' || r.status === 'In Review').length;

  const aiCtx: AiContext = useMemo(
    () => ({
      profile,
      balances,
      myLeave,
      teamLeave,
      payslips,
      assets,
      requests,
      isApprover: ESS_IS_LEAVE_APPROVER
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, leaveRequests, balances, payslips, assets, requests]
  );
  const aiHighCount = useMemo(() => detectIssues(aiCtx).filter((f) => f.severity === 'high').length, [aiCtx]);

  const handleAiAction = (a: AiAction) => {
    switch (a.kind) {
      case 'goto':
        if (a.tab === 'records') setRecordsSub('assets');
        setTab(a.tab as EssTab);
        break;
      case 'request':
        openNewRequest(a.type, a.details);
        break;
      case 'fix-profile':
        saveProfile({ ...profile, ...a.patch });
        addToast({ type: 'success', title: 'Profile corrected', message: 'The suggested fix was applied to your profile.' });
        break;
      case 'agent':
        setAgentPrompt(a.prompt);
        setTab('ai');
        break;
    }
  };

  const acknowledgeAsset = (id: string) => setAssets((xs) => xs.map((x) => (x.id === id ? { ...x, acknowledged: true } : x)));

  return (
    <div className="ess-portal">
      {/* Portal header */}
      <header className="ess-hero">
        <div className="ess-hero-inner">
          <button className="hr-breadcrumb-btn ess-back" onClick={() => setCurrentView('apps')}>
            <ArrowLeft size={13} /> Apps Launcher
          </button>
          <div className="ess-hero-row">
            <div className="ess-identity">
              {essRecord?.photoUrl ? <img className="ess-avatar ess-photo" src={essRecord.photoUrl} alt={ESS_EMPLOYEE.fullName} /> : <div className="ess-avatar">{ESS_EMPLOYEE.initials}</div>}
              <div>
                <span className="ess-eyebrow">Employee Self-Service</span>
                <h1>
                  {greeting()}, {ESS_EMPLOYEE.preferredName}
                </h1>
                <p>
                  {ESS_EMPLOYEE.jobTitle} · {ESS_EMPLOYEE.department} · {ESS_EMPLOYEE.staffId}
                </p>
              </div>
            </div>
            <button className={`btn ${clockedIn ? 'btn-secondary' : 'btn-primary'} ess-clock-btn`} onClick={handleClock}>
              {clockedIn ? <LogOut size={15} /> : <LogIn size={15} />}
              {clockedIn ? 'Clock out' : 'Clock in'}
            </button>
          </div>
        </div>

        <nav className="ess-tabs" role="tablist" aria-label="Employee portal sections">
          {TABS.filter((t) => !t.approverOnly || ESS_IS_LEAVE_APPROVER).map((t) => {
            const Icon = t.icon;
            const count = t.id === 'requests' ? pendingCount : t.id === 'approvals' ? approvalsPending.length : t.id === 'ai' ? aiHighCount : 0;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`ess-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => {
                  setTab(t.id);
                  if (t.id !== 'requests') setRequestPreset(null);
                }}
              >
                <Icon size={15} />
                <span>{t.label}</span>
                {count > 0 && <span className={`ess-tab-count ${t.id === 'approvals' || t.id === 'ai' ? 'alert' : ''}`}>{count}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="ess-body" key={tab}>
        {tab === 'home' && <AiHomeCard ctx={aiCtx} onAction={handleAiAction} onOpen={() => setTab('ai')} />}
        {tab === 'ai' && (
          <EssAiAssistant
            ctx={aiCtx}
            onAction={handleAiAction}
            agentPrompt={agentPrompt}
            onPromptConsumed={() => setAgentPrompt(null)}
            onSubmitLeave={(r) =>
              createLeaveRequest({
                staffId: ESS_EMPLOYEE.staffId,
                staffName: ESS_EMPLOYEE.fullName,
                approverName: ESS_EMPLOYEE.manager.split(' (')[0],
                ...r
              })
            }
          />
        )}
        {tab === 'home' && (
          <EssHome
            balances={balances}
            lastNet={payslips[0]?.netPay ?? 0}
            lastPeriod={payslips[0]?.period ?? ''}
            pendingCount={pendingCount}
            clockedIn={clockedIn}
            lastPunch={punches[punches.length - 1]}
            onApplyLeave={() => goLeave(true)}
            onViewPayslips={() => {
              setPaySub('payslips');
              setTab('pay');
            }}
            approvalsPending={approvalsPending}
            assetsToAck={assetsToAck}
            onGoApprovals={() => setTab('approvals')}
            onGoPerformance={() => setTab('performance')}
            onGoAssets={() => {
              setRecordsSub('assets');
              setTab('records');
            }}
            onClock={handleClock}
            onNewRequest={openNewRequest}
            onGoRequests={() => setTab('requests')}
            onGoLeave={() => goLeave(false)}
          />
        )}
        {tab === 'leave' && (
          <EssLeave
            balances={balances}
            myLeave={myLeave}
            formOpen={leaveFormOpen}
            setFormOpen={setLeaveFormOpen}
            onCancel={cancelLeaveRequest}
            onSubmit={(req) => {
              createLeaveRequest({
                staffId: ESS_EMPLOYEE.staffId,
                staffName: ESS_EMPLOYEE.fullName,
                approverName: ESS_EMPLOYEE.manager.split(' (')[0],
                ...req
              });
              setLeaveFormOpen(false);
            }}
          />
        )}
        {tab === 'approvals' && <EssApprovals pending={approvalsPending} decided={approvalsDecided} />}
        {tab === 'pay' && (
          <div className="ess-stack">
            <SubTabs
              value={paySub}
              onChange={setPaySub}
              items={[
                { id: 'payslips', label: 'Payslips', icon: Wallet },
                { id: 'p9', label: 'P9 Tax Card', icon: Receipt }
              ]}
            />
            {paySub === 'payslips' ? <EssPayslips payslips={payslips} /> : <EssP9 />}
          </div>
        )}
        {tab === 'performance' && <EssPerformance />}
        {tab === 'records' && (
          <div className="ess-stack">
            <SubTabs
              value={recordsSub}
              onChange={setRecordsSub}
              items={[
                { id: 'assets', label: 'My Assets', icon: Package },
                { id: 'disciplinary', label: 'Disciplinary History', icon: AlertCircle },
                { id: 'documents', label: 'Documents', icon: FolderOpen }
              ]}
            />
            {recordsSub === 'assets' && <EssAssets assets={assets} onAcknowledge={acknowledgeAsset} onReport={openNewRequest} />}
            {recordsSub === 'disciplinary' && <EssDisciplinary />}
            {recordsSub === 'documents' && <EssDocuments />}
          </div>
        )}
        {tab === 'attendance' && <EssAttendance punches={punches} clockedIn={clockedIn} onClock={handleClock} />}
        {tab === 'requests' && (
          <EssRequests
            requests={requests}
            preset={requestPreset}
            presetDetails={requestDetails}
            onClearPreset={() => {
              setRequestPreset(null);
              setRequestDetails('');
            }}
            onSubmit={submitRequest}
            noticeDays={/manager|director|head|chief/i.test(ESS_EMPLOYEE.jobTitle) ? 90 : 30}
          />
        )}
        {tab === 'profile' && (
          <div className="ess-stack">
            <ProfileCompletenessCard ctx={aiCtx} />
            <EssProfile profile={profile} onSave={saveProfile} onRequestChange={openNewRequest} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

type Balance = {
  type: LeaveRequest['leaveType'];
  total: number;
  used: number;
  pending: number;
  available: number;
};

interface EssHomeProps {
  balances: Balance[];
  lastNet: number;
  lastPeriod: string;
  pendingCount: number;
  clockedIn: boolean;
  lastPunch?: Punch;
  onApplyLeave: () => void;
  onViewPayslips: () => void;
  onClock: () => void;
  onNewRequest: (t: EssRequestType) => void;
  onGoRequests: () => void;
  onGoLeave: () => void;
  approvalsPending: LeaveRequest[];
  assetsToAck: number;
  onGoApprovals: () => void;
  onGoPerformance: () => void;
  onGoAssets: () => void;
}

const EssHome: React.FC<EssHomeProps> = ({
  balances,
  lastNet,
  lastPeriod,
  pendingCount,
  clockedIn,
  lastPunch,
  onApplyLeave,
  onViewPayslips,
  onClock,
  onNewRequest,
  onGoRequests,
  onGoLeave,
  approvalsPending,
  assetsToAck,
  onGoApprovals,
  onGoPerformance,
  onGoAssets
}) => {
  const appraisalDaysLeft = Math.ceil((new Date(ESS_ACTIVE_APPRAISAL.selfAssessmentDue + 'T00:00:00').getTime() - Date.now()) / 86400000);
  const attention = [
    ...(approvalsPending.length
      ? [{
          key: 'approvals',
          tone: 'alert',
          icon: ClipboardCheck,
          title: `${approvalsPending.length} leave application${approvalsPending.length === 1 ? '' : 's'} need your approval`,
          sub: approvalsPending.map((l) => l.staffName.split(' ')[0]).join(', '),
          action: 'Review',
          onClick: onGoApprovals
        }]
      : []),
    ...(ESS_ACTIVE_APPRAISAL.stage === 'Self-assessment'
      ? [{
          key: 'appraisal',
          tone: appraisalDaysLeft <= 14 ? 'warn' : 'info',
          icon: Target,
          title: `Self-assessment for ${ESS_ACTIVE_APPRAISAL.cycle} is open`,
          sub: `Due ${formatDate(ESS_ACTIVE_APPRAISAL.selfAssessmentDue)} · ${appraisalDaysLeft} days left`,
          action: 'Start',
          onClick: onGoPerformance
        }]
      : []),
    ...(assetsToAck
      ? [{
          key: 'assets',
          tone: 'info',
          icon: Package,
          title: `${assetsToAck} new asset${assetsToAck === 1 ? '' : 's'} to acknowledge`,
          sub: 'Confirm you received the equipment issued to you',
          action: 'Open',
          onClick: onGoAssets
        }]
      : [])
  ];

  const annual = balances.find((b) => b.type === 'Annual Leave');
  const payday = nextPayDate();
  const daysToPay = Math.max(0, Math.ceil((payday.getTime() - Date.now()) / 86400000));
  const today = todayIso();
  // Live holiday calendar from HR (company holidays for HQ included)
  const { leaveHolidays } = useApp();
  const upcoming = leaveHolidays
    .filter((h) => (h.location === 'ALL' || h.location === 'org-nairobi') && (h.observed || h.date) >= today)
    .map((h) => ({ date: h.observed || h.date, name: h.name }))
    .slice(0, 3);

  const quickActions = [
    { label: 'Apply for leave', icon: Plane, onClick: onApplyLeave, tone: 'blue' },
    { label: 'View payslip', icon: Wallet, onClick: onViewPayslips, tone: 'green' },
    { label: clockedIn ? 'Clock out' : 'Clock in', icon: clockedIn ? LogOut : LogIn, onClick: onClock, tone: 'amber' },
    { label: 'Request a letter', icon: FileText, onClick: () => onNewRequest('Employment Confirmation Letter'), tone: 'violet' },
    { label: 'Claim expenses', icon: Plus, onClick: () => onNewRequest('Expense Reimbursement'), tone: 'teal' },
    { label: 'Salary advance', icon: Wallet, onClick: () => onNewRequest('Salary Advance'), tone: 'rose' }
  ];

  return (
    <div className="ess-home">
      {/* Key stats */}
      <div className="ess-stat-grid">
        <button className="ess-stat" onClick={onGoLeave}>
          <span className="ess-stat-label">Annual leave available</span>
          <span className="ess-stat-value">
            {annual?.available ?? 0} <small>days</small>
          </span>
          <span className="ess-stat-sub">
            {annual?.used ?? 0} used · {annual?.pending ?? 0} pending
          </span>
        </button>
        <button className="ess-stat" onClick={onViewPayslips}>
          <span className="ess-stat-label">Last net pay</span>
          <span className="ess-stat-value">{formatKes(lastNet)}</span>
          <span className="ess-stat-sub">{lastPeriod}</span>
        </button>
        <div className="ess-stat">
          <span className="ess-stat-label">Next payday</span>
          <span className="ess-stat-value">
            {payday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
          <span className="ess-stat-sub">{daysToPay === 0 ? 'Today' : `In ${daysToPay} day${daysToPay === 1 ? '' : 's'}`}</span>
        </div>
        <button className="ess-stat" onClick={onGoRequests}>
          <span className="ess-stat-label">Open requests</span>
          <span className="ess-stat-value">{pendingCount}</span>
          <span className="ess-stat-sub">Leave & service requests in progress</span>
        </button>
      </div>

      {attention.length > 0 && (
        <section className="ess-attention" aria-label="Needs your attention">
          <h3>Needs your attention</h3>
          <ul>
            {attention.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.key} className={`tone-${a.tone}`}>
                  <span className="ess-attention-icon">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <span>{a.sub}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={a.onClick}>
                    {a.action} <ChevronRight size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="ess-home-grid">
        <div className="ess-col">
          {/* Quick actions */}
          <section className="ess-card">
            <div className="ess-card-head">
              <h3>Quick actions</h3>
            </div>
            <div className="ess-quick-grid">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.label} className="ess-quick" onClick={a.onClick}>
                    <span className={`ess-quick-icon tone-${a.tone}`}>
                      <Icon size={18} />
                    </span>
                    <span>{a.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Announcements */}
          <section className="ess-card">
            <div className="ess-card-head">
              <h3>
                <Megaphone size={15} /> Announcements
              </h3>
            </div>
            <ul className="ess-list">
              {ESS_ANNOUNCEMENTS.map((a) => (
                <li key={a.id} className="ess-announcement">
                  <div className="ess-announcement-meta">
                    <span className="badge badge-info">{a.tag}</span>
                    <span>{formatDate(a.date)}</span>
                  </div>
                  <strong>{a.title}</strong>
                  <p>{a.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="ess-col">
          {/* Today */}
          <section className="ess-card">
            <div className="ess-card-head">
              <h3>
                <Clock size={15} /> Today
              </h3>
              <span className={`ess-presence ${clockedIn ? 'on' : ''}`}>{clockedIn ? 'Clocked in' : 'Not clocked in'}</span>
            </div>
            <div className="ess-today">
              <div className="ess-today-date">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="ess-today-meta">
                <MapPin size={13} /> {ESS_EMPLOYEE.branch} · Shift 08:00–17:00
              </div>
              {lastPunch && (
                <div className="ess-today-meta">
                  Last punch: {lastPunch.type === 'IN' ? 'In' : 'Out'} at {lastPunch.time}
                </div>
              )}
            </div>
          </section>

          {/* Leave balances */}
          <section className="ess-card">
            <div className="ess-card-head">
              <h3>
                <CalendarDays size={15} /> Leave balances
              </h3>
              <button className="ess-link" onClick={onGoLeave}>
                View all <ChevronRight size={13} />
              </button>
            </div>
            <div className="ess-balance-list">
              {balances.map((b) => (
                <div key={b.type} className="ess-balance-row">
                  <div className="ess-balance-top">
                    <span>{b.type}</span>
                    <strong>
                      {b.available} / {b.total}
                    </strong>
                  </div>
                  <div className="ess-meter">
                    <span style={{ width: `${b.total ? (b.used / b.total) * 100 : 0}%` }} className="used" />
                    <span style={{ width: `${b.total ? (b.pending / b.total) * 100 : 0}%` }} className="pending" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Who's out + holidays */}
          <section className="ess-card">
            <div className="ess-card-head">
              <h3>
                <Users size={15} /> Team out today
              </h3>
            </div>
            {TEAM_OUT_TODAY.length === 0 && <p className="ess-muted">Everyone you approve leave for is in today.</p>}
            <ul className="ess-list compact">
              {TEAM_OUT_TODAY.map((p) => (
                <li key={p.name} className="ess-person">
                  <span className="ess-mini-avatar">
                    {p.name
                      .split(' ')
                      .map((x) => x[0])
                      .join('')}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <span>
                      {p.reason} · back {formatDate(p.until, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="ess-card">
            <div className="ess-card-head">
              <h3>
                <PartyPopper size={15} /> Upcoming holidays
              </h3>
            </div>
            <ul className="ess-list compact">
              {upcoming.map((h) => (
                <li key={h.date} className="ess-holiday">
                  <span className="ess-date-chip">
                    <b>{formatDate(h.date, { day: 'numeric' })}</b>
                    {formatDate(h.date, { month: 'short' })}
                  </span>
                  <div>
                    <strong>{h.name}</strong>
                    <span>{formatDate(h.date, { weekday: 'long' })}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Leave                                                               */
/* ------------------------------------------------------------------ */

interface EssLeaveProps {
  balances: Balance[];
  myLeave: LeaveRequest[];
  formOpen: boolean;
  setFormOpen: (v: boolean) => void;
  onCancel: (id: string) => void;
  onSubmit: (req: {
    leaveType: LeaveRequest['leaveType'];
    startDate: string;
    endDate: string;
    daysCount: number;
    reason: string;
    attachment?: boolean;
  }) => void;
}

const LEAVE_STATUS: Record<LeaveRequest['status'], { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Pending approval', cls: 'warning' },
  APPROVED: { label: 'Approved', cls: 'success' },
  REJECTED: { label: 'Declined', cls: 'critical' },
  CANCELLED: { label: 'Cancelled', cls: 'info' }
};

const LEAVE_FILTERS: { id: 'ALL' | LeaveRequest['status']; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING_APPROVAL', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Declined' },
  { id: 'CANCELLED', label: 'Cancelled' }
];

const EssLeave: React.FC<EssLeaveProps> = ({ balances, myLeave, formOpen, setFormOpen, onCancel, onSubmit }) => {
  const [filter, setFilter] = useState<'ALL' | LeaveRequest['status']>('ALL');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const shown = filter === 'ALL' ? myLeave : myLeave.filter((l) => l.status === filter);
  const countFor = (id: 'ALL' | LeaveRequest['status']) => (id === 'ALL' ? myLeave.length : myLeave.filter((l) => l.status === id).length);
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('Annual Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handover, setHandover] = useState('');
  const [touched, setTouched] = useState(false);

  const { hrEmployees, leaveRequests, leaveCfg } = useApp();
  const [attachment, setAttachment] = useState(false);
  const me = hrEmployees.find((e) => e.staffId === ESS_EMPLOYEE.staffId);
  // The leave engine applies the same rules HR uses (notice, overlap, documents, balance)
  const check =
    me && startDate && endDate && endDate >= startDate
      ? validateLeaveRequest(me, { code: codeOf(leaveType, leaveCfg), startDate, endDate, attachment, submittedBy: 'EMPLOYEE' }, leaveRequests, leaveCfg)
      : null;
  const days = check ? check.days : workingDaysBetween(startDate, endDate);
  const balance = balances.find((b) => b.type === leaveType);
  const exceeds = !!balance && days > balance.available;
  const datesInvalid = !!startDate && !!endDate && endDate < startDate;
  const needsDoc = !!check && check.type.attachmentAfterDays !== null && days > check.type.attachmentAfterDays;
  const ruleError = check && !check.ok ? check.errors.find((m) => !m.startsWith('Needs')) : undefined;
  const canSubmit = !!startDate && !!endDate && days > 0 && !exceeds && !ruleError && reason.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({
      leaveType,
      startDate,
      endDate,
      daysCount: days,
      attachment,
      reason: handover.trim() ? `${reason.trim()} — Handover: ${handover.trim()}` : reason.trim()
    });
    setStartDate('');
    setEndDate('');
    setReason('');
    setHandover('');
    setTouched(false);
  };

  return (
    <div className="ess-stack">
      <div className="ess-balance-cards">
        {balances.map((b) => (
          <div key={b.type} className={`ess-balance-card ${leaveType === b.type && formOpen ? 'selected' : ''}`}>
            <span className="ess-stat-label">{b.type}</span>
            <span className="ess-stat-value">
              {b.available}
              <small> days left</small>
            </span>
            <div className="ess-meter">
              <span style={{ width: `${b.total ? (b.used / b.total) * 100 : 0}%` }} className="used" />
              <span style={{ width: `${b.total ? (b.pending / b.total) * 100 : 0}%` }} className="pending" />
            </div>
            <span className="ess-stat-sub">
              {b.total} total · {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
            </span>
          </div>
        ))}
      </div>

      {formOpen && (
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>Apply for leave</h3>
        </div>
        {(
          <form className="ess-form" onSubmit={submit} noValidate>
            <div className="ess-form-grid">
              <label className="req-field">
                <span>Leave type</span>
                <select
                  className="form-control"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leaveType'])}
                >
                  {balances.map((b) => (
                    <option key={b.type} value={b.type}>
                      {b.type} ({b.available} days available)
                    </option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>Start date</span>
                <input
                  type="date"
                  className={`form-control ${touched && !startDate ? 'is-invalid' : ''}`}
                  min={todayIso()}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
                  }}
                />
              </label>
              <label className="req-field">
                <span>End date</span>
                <input
                  type="date"
                  className={`form-control ${(touched && !endDate) || datesInvalid ? 'is-invalid' : ''}`}
                  min={startDate || todayIso()}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
              <div className="ess-days-pill">
                <span>Working days</span>
                <strong className={exceeds ? 'over' : ''}>{days}</strong>
              </div>
              <label className="req-field ess-span-2">
                <span>Reason *</span>
                <textarea
                  className={`form-control ${touched && !reason.trim() ? 'is-invalid' : ''}`}
                  rows={2}
                  placeholder="e.g., Family visit upcountry"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="req-field ess-span-2">
                <span>Handover notes (optional)</span>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Who is covering for you and any pending work"
                  value={handover}
                  onChange={(e) => setHandover(e.target.value)}
                />
              </label>
            </div>

            {needsDoc && (
              <label className="lv-check" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={attachment} onChange={(e) => setAttachment(e.target.checked)} />
                I have a supporting document (medical note or letter) to hand in
              </label>
            )}

            {(exceeds || datesInvalid || !!ruleError || (touched && !canSubmit)) && (
              <div className="req-error">
                <AlertCircle size={14} />
                {exceeds
                  ? `This needs ${days} days but you have ${balance?.available ?? 0} ${leaveType.toLowerCase()} days available.`
                  : datesInvalid
                  ? 'End date must be on or after the start date.'
                  : ruleError
                  ? ruleError
                  : days === 0 && startDate && endDate
                  ? 'The selected dates fall on weekends or public holidays.'
                  : 'Choose your dates and add a reason.'}
              </div>
            )}

            <div className="ess-form-actions">
              <span className="ess-hint">Weekends and public holidays are not counted. Your manager is notified on submit.</span>
              <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Submit application
              </button>
            </div>
          </form>
        )}

      </section>
      )}

      <section className="ess-card">
        <div className="ess-card-head ess-doc-toolbar">
          <h3>Leave applications & history</h3>
          <div className="ess-doc-filters">
            <div className="ess-chip-row">
              {LEAVE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`digicraft-filter-pill ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label} <span className="ess-pill-count">{countFor(f.id)}</span>
                </button>
              ))}
            </div>
            {!formOpen && (
              <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
                <Plus size={14} /> Apply for leave
              </button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="ess-empty">
            <CalendarDays size={28} />
            <strong>{myLeave.length === 0 ? 'No leave applications yet' : 'Nothing with this status'}</strong>
            <span>Applications you submit appear here with their approval status.</span>
          </div>
        ) : (
          <ul className="ess-leave-list">
            {shown.map((l) => (
              <li key={l.id} className={`ess-leave-item status-${l.status.toLowerCase()}`}>
                <div className="ess-leave-dates">
                  <span className="ess-date-chip">
                    <b>{formatDate(l.startDate, { day: 'numeric' })}</b>
                    {formatDate(l.startDate, { month: 'short' })}
                  </span>
                </div>
                <div className="ess-leave-body">
                  <div className="ess-leave-top">
                    <strong>
                      {l.leaveType} · {l.daysCount} day{l.daysCount === 1 ? '' : 's'}
                    </strong>
                    <span className={`digicraft-status-pill ${LEAVE_STATUS[l.status].cls}`}>{LEAVE_STATUS[l.status].label}</span>
                  </div>
                  <span className="ess-muted">
                    {formatDate(l.startDate, { weekday: 'short', day: 'numeric', month: 'short' })} – {formatDate(l.endDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {l.id}
                    {l.appliedOn ? ` · Applied ${formatDate(l.appliedOn)}` : ''}
                  </span>
                  <p>{l.reason}</p>
                  <div className="ess-leave-trail">
                    {l.status === 'PENDING_APPROVAL' && <span>Waiting for {l.approverName ?? 'your manager'}</span>}
                    {(l.status === 'APPROVED' || l.status === 'REJECTED') && (
                      <span>
                        {l.status === 'APPROVED' ? 'Approved' : 'Declined'} by {l.approverName ?? 'your manager'}
                        {l.decidedOn ? ` on ${formatDate(l.decidedOn)}` : ''}
                      </span>
                    )}
                    {l.status === 'CANCELLED' && <span>Withdrawn by you{l.decidedOn ? ` on ${formatDate(l.decidedOn)}` : ''}</span>}
                    {l.approverComment && <q>{l.approverComment}</q>}
                  </div>
                </div>
                {l.status === 'PENDING_APPROVAL' && (
                  <div className="ess-leave-actions">
                    {confirmCancel === l.id ? (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setConfirmCancel(null)}>
                          Keep
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            onCancel(l.id);
                            setConfirmCancel(null);
                          }}
                        >
                          Withdraw
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(l.id)}>
                        <XCircle size={14} /> Cancel application
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};


/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

const PAST_DAYS = [
  { offset: 1, in: '07:52', out: '17:06' },
  { offset: 2, in: '08:04', out: '17:31' },
  { offset: 3, in: '07:58', out: '16:59' },
  { offset: 4, in: '08:11', out: '17:20' },
  { offset: 5, in: '07:47', out: '17:02' },
  { offset: 6, in: '07:55', out: '17:15' },
  { offset: 7, in: '08:02', out: '17:08' }
];

const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

const EssAttendance: React.FC<{ punches: Punch[]; clockedIn: boolean; onClock: () => void }> = ({
  punches,
  clockedIn,
  onClock
}) => {
  // Previous working days (skip weekends)
  const history = useMemo(() => {
    const rows: { date: Date; in: string; out: string; late: boolean; mins: number }[] = [];
    const d = new Date();
    let i = 0;
    while (rows.length < 5 && i < 14) {
      d.setDate(d.getDate() - 1);
      i++;
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const p = PAST_DAYS[rows.length];
      rows.push({ date: new Date(d), in: p.in, out: p.out, late: p.in > '08:05', mins: minutesBetween(p.in, p.out) - 60 });
    }
    return rows;
  }, []);

  const weekMins = history.reduce((s, r) => s + r.mins, 0);
  const lateCount = history.filter((r) => r.late).length;

  return (
    <div className="ess-stack">
      <div className="ess-stat-grid">
        <div className="ess-stat ess-clock-card">
          <span className="ess-stat-label">Today</span>
          <span className="ess-stat-value">{clockedIn ? 'On shift' : punches.length ? 'Clocked out' : 'Not started'}</span>
          <button className={`btn ${clockedIn ? 'btn-secondary' : 'btn-primary'}`} onClick={onClock}>
            {clockedIn ? <LogOut size={15} /> : <LogIn size={15} />}
            {clockedIn ? 'Clock out' : 'Clock in'}
          </button>
        </div>
        <div className="ess-stat">
          <span className="ess-stat-label">Hours, last 5 days</span>
          <span className="ess-stat-value">{hm(weekMins)}</span>
          <span className="ess-stat-sub">Excludes 1h lunch break</span>
        </div>
        <div className="ess-stat">
          <span className="ess-stat-label">Late arrivals</span>
          <span className="ess-stat-value">{lateCount}</span>
          <span className="ess-stat-sub">After 08:05 grace period</span>
        </div>
        <div className="ess-stat">
          <span className="ess-stat-label">Shift</span>
          <span className="ess-stat-value">08:00–17:00</span>
          <span className="ess-stat-sub">Mon–Fri · {ESS_EMPLOYEE.branch}</span>
        </div>
      </div>

      <section className="ess-card">
        <div className="ess-card-head">
          <h3>Today's punches</h3>
        </div>
        {punches.length === 0 ? (
          <div className="ess-empty">
            <Clock size={28} />
            <strong>No punches yet today</strong>
            <span>Use Clock in when you start work. Your location is recorded with each punch.</span>
          </div>
        ) : (
          <ul className="ess-timeline">
            {punches.map((p, i) => (
              <li key={i} className={p.type === 'IN' ? 'in' : 'out'}>
                <span className="ess-timeline-dot" />
                <strong>{p.type === 'IN' ? 'Clock in' : 'Clock out'}</strong>
                <span>{p.time}</span>
                <span className="ess-muted">{p.location}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ess-card">
        <div className="ess-card-head">
          <h3>Recent attendance</h3>
        </div>
        <div className="ess-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.date.toISOString()}>
                  <td style={{ fontWeight: 600 }}>
                    {r.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </td>
                  <td>{r.in}</td>
                  <td>{r.out}</td>
                  <td>{hm(r.mins)}</td>
                  <td>
                    {r.late ? (
                      <span className="digicraft-status-pill warning">Late</span>
                    ) : (
                      <span className="digicraft-status-pill success">
                        <CheckCircle2 size={11} /> On time
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
