import React, { useState } from 'react';
import {
  User,
  ShieldCheck,
  KeyRound,
  Bell,
  Terminal,
  AlertOctagon,
  Camera,
  CheckCircle2,
  Lock,
  Globe,
  Mail,
  Smartphone,
  Building,
  Clock,
  Laptop,
  Trash2,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Save,
  ExternalLink,
} from 'lucide-react';
import {
  TextInput,
  PasswordInput,
  ToggleSwitch,
  FormActionBar
} from '../components/forms/FormControls';
import {
  DatePickerDropdown,
  TimePickerDropdown
} from '../components/forms/DateTimePicker';
import { useApp } from '../context/AppContext';

export const ProfileView: React.FC = () => {
  const {  addToast } = useApp();

  // Active User Profile Tab
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'notifications' | 'tokens' | 'danger'>('general');

  // Personal Profile Form State
  const initialProfile = {
    firstName: 'Sarah',
    lastName: 'Kim',
    displayName: 'Sarah Kim (Principal Architect)',
    username: 'sarahkim',
    email: 'sarah.kim@missioncontrol.io',
    recoveryEmail: 'sarah.kim.recovery@acme.corp',
    phone: '+1 (555) 234-5678',
    title: 'Principal Cloud Infrastructure Architect & Super Admin',
    department: 'Cloud Infrastructure & Security',
    timezone: 'America/New_York (UTC-04:00)',
    language: 'en-US',
    bio: 'Lead architect orchestrating distributed multi-cloud control planes, zero-trust cryptographic identities, and SOC2 automated compliance guardrails.'
  };

  const [profile, setProfile] = useState(initialProfile);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [bioPreview, setBioPreview] = useState(false);

  // Check dirty state for Profile
  const isProfileDirty = JSON.stringify(profile) !== JSON.stringify(initialProfile);

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Notification Preferences State
  const [notifications, setNotifications] = useState({
    criticalIncidentsEmail: true,
    criticalIncidentsSlack: true,
    criticalIncidentsSms: true,
    securityVulnerabilitiesEmail: true,
    securityVulnerabilitiesSlack: true,
    securityVulnerabilitiesSms: false,
    billingInvoicesEmail: true,
    billingInvoicesSlack: false,
    weeklyDigestEmail: true,
    accessRequestsSlack: true
  });
  const [quietHours, setQuietHours] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState('10:00 PM');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00 AM');
  const [customTokenExpiryDate, setCustomTokenExpiryDate] = useState('2026-12-31');

  // API Tokens State
  interface ApiToken {
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: string[];
    created: string;
    expires: string;
    lastUsed: string;
  }

  const [tokens, setTokens] = useState<ApiToken[]>([
    {
      id: 'tok-1',
      name: 'Terraform Cloud Provisioner',
      tokenPrefix: 'mc_pat_live_79a2...',
      scopes: ['admin:infrastructure', 'write:workflows'],
      created: '2026-08-12',
      expires: 'In 6 months',
      lastUsed: '14 minutes ago'
    },
    {
      id: 'tok-2',
      name: 'GitHub Actions CI/CD Pipeline',
      tokenPrefix: 'mc_pat_live_12bc...',
      scopes: ['read:audit', 'write:deployments'],
      created: '2026-07-01',
      expires: 'In 30 days',
      lastUsed: '2 hours ago'
    }
  ]);

  const [showNewTokenModal, setShowNewTokenModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenExpiry, setNewTokenExpiry] = useState('90');
  const [newTokenScopes, setNewTokenScopes] = useState<string[]>(['read:audit', 'write:workflows']);
  const [generatedRawToken, setGeneratedRawToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Active Sessions
  const [sessions, setSessions] = useState([
    {
      id: 'sess-1',
      device: 'MacBook Pro 16" · Chrome 128 (macOS Sonoma)',
      ip: '198.51.100.42',
      location: 'New York, United States',
      lastActive: 'Active now',
      isCurrent: true
    },
    {
      id: 'sess-2',
      device: 'iPhone 16 Pro · Safari Mobile (iOS 18)',
      ip: '198.51.100.45',
      location: 'New York, United States',
      lastActive: '4 hours ago',
      isCurrent: false
    },
    {
      id: 'sess-3',
      device: 'Workstation ThinkPad · Edge 127 (Windows 11)',
      ip: '203.0.113.88',
      location: 'Boston, United States',
      lastActive: '2 days ago',
      isCurrent: false
    }
  ]);

  // Danger Zone Confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Handle Username Change with Async Availability Simulation
  const handleUsernameChange = (val: string) => {
    setProfile({ ...profile, username: val });
    setUsernameChecking(true);
    setTimeout(() => {
      setUsernameChecking(false);
    }, 450);
  };

  // Save Profile Handler
  const handleSaveProfile = () => {
    const errors: Record<string, string> = {};
    if (!profile.firstName.trim()) errors.firstName = 'First name is required.';
    if (!profile.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!profile.email.includes('@')) errors.email = 'Valid corporate email required.';
    if (!profile.username.trim()) errors.username = 'Username is required.';

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      addToast({
        type: 'error',
        title: 'Form Errors Detected',
        message: 'Please resolve required profile fields before saving.'
      });
      return;
    }

    setIsSavingProfile(true);
    setTimeout(() => {
      setIsSavingProfile(false);
      setProfileErrors({});
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your personal and organizational profile settings have been persisted.'
      });
    }, 700);
  };

  // Save Password Handler
  const handleSavePassword = () => {
    if (!currentPassword) {
      setPasswordError('Current password is required to authorize modifications.');
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError('New password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation password do not match.');
      return;
    }

    setIsSavingPassword(true);
    setTimeout(() => {
      setIsSavingPassword(false);
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        type: 'success',
        title: 'Password Updated',
        message: 'Enterprise credentials rotated successfully. All secondary sessions notified.'
      });
    }, 850);
  };

  // Generate Token Handler
  const handleCreateToken = () => {
    if (!newTokenName.trim()) return;
    const rawSecret = `mc_pat_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const newToken: ApiToken = {
      id: `tok-${Date.now()}`,
      name: newTokenName,
      tokenPrefix: `${rawSecret.substring(0, 16)}...`,
      scopes: newTokenScopes,
      created: 'Today',
      expires: `In ${newTokenExpiry} days`,
      lastUsed: 'Never'
    };
    setTokens([newToken, ...tokens]);
    setGeneratedRawToken(rawSecret);
  };

  // Revoke Session Handler
  const handleRevokeSession = (sessionId: string) => {
    setSessions(sessions.filter((s) => s.id !== sessionId));
    addToast({
      type: 'warning',
      title: 'Session Revoked',
      message: 'Authentication token invalidated for remote device.'
    });
  };

  const handleRevokeAllOtherSessions = () => {
    setSessions(sessions.filter((s) => s.isCurrent));
    addToast({
      type: 'warning',
      title: 'Global Invalidation',
      message: 'All remote active sessions terminated.'
    });
  };

  return (
    <div className="view-container" style={{ paddingBottom: 60 }}>
      {/* Profile Banner & Hero Card */}
      <div className="profile-banner-hero">
        <div className="profile-hero-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="profile-avatar-stack">
              <div className="profile-avatar-large">SK</div>
              <button
                type="button"
                className="profile-avatar-upload-badge"
                title="Upload custom avatar image"
                onClick={() =>
                  addToast({
                    type: 'info',
                    title: 'Avatar Upload',
                    message: 'Select an image file (PNG/JPEG) up to 5MB.'
                  })
                }
              >
                <Camera size={13} />
              </button>
            </div>

            <div className="profile-details-column">
              <div className="profile-name-row">
                <span className="profile-display-name">
                  {profile.firstName} {profile.lastName}
                </span>
                <span className="nav-badge nav-badge-critical" style={{ background: 'rgba(35, 120, 87, 0.15)', color: 'var(--text-accent)', borderColor: 'rgba(35, 120, 87, 0.4)' }}>
                  Super Admin
                </span>
                <span className="nav-badge nav-badge-neutral" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--status-success-text)', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                  <Check size={11} style={{ display: 'inline', marginRight: 2 }} /> Verified
                </span>
              </div>

              <div className="profile-meta-row">
                <div className="profile-meta-item">
                  <Building size={13} color="var(--text-tertiary)" />
                  <span>Acme Corporation · Infrastructure</span>
                </div>
                <div className="profile-meta-item">
                  <Globe size={13} color="var(--text-tertiary)" />
                  <span>New York, USA</span>
                </div>
                <div className="profile-meta-item">
                  <Clock size={13} color="var(--text-tertiary)" />
                  <span>Local Time: 11:33 AM EDT</span>
                </div>
              </div>

              <div className="profile-stats-row">
                <div className="profile-stat-box">
                  <span className="profile-stat-label">Security Score</span>
                  <span className="profile-stat-val" style={{ color: 'var(--status-success-text)' }}>
                    98 / 100
                  </span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-label">2FA MFA Status</span>
                  <span className="profile-stat-val" style={{ color: 'var(--brand-primary)' }}>
                    FIDO2 Hardware Key
                  </span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-label">Active Sessions</span>
                  <span className="profile-stat-val">{sessions.length} Devices</span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-label">Member Since</span>
                  <span className="profile-stat-val">March 2024</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSaveProfile}
              disabled={!isProfileDirty || isSavingProfile}
            >
              <Save size={13} /> Save Profile
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(`https://control.missioncontrol.io/users/${profile.username}`);
                addToast({
                  type: 'info',
                  title: 'Link Copied',
                  message: 'Public profile URL copied to clipboard.'
                });
              }}
            >
              <ExternalLink size={13} /> Share Profile
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Header */}
      <div className="profile-tabs-header">
        <button
          className={`profile-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <User size={14} /> Personal & Org Details
        </button>
        <button
          className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          <KeyRound size={14} /> Security & Password
        </button>
        <button
          className={`profile-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={14} /> Notifications & Routing
        </button>
        <button
          className={`profile-tab-btn ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          <Terminal size={14} /> Developer API Tokens
        </button>
        <button
          className={`profile-tab-btn ${activeTab === 'danger' ? 'active' : ''}`}
          onClick={() => setActiveTab('danger')}
          style={{ color: activeTab === 'danger' ? 'var(--status-critical-text)' : undefined }}
        >
          <AlertOctagon size={14} /> Danger Zone
        </button>
      </div>

      {/* ====================================================================
          TAB 1: PERSONAL & ORG DETAILS
          ==================================================================== */}
      {activeTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Personal Information
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Update your enterprise identity, display handles, and contact credentials.
                </p>
              </div>

              {isProfileDirty && (
                <span className="dirty-state-pill">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--status-warning)',
                      display: 'inline-block'
                    }}
                  />
                  Unsaved modifications
                </span>
              )}
            </div>

            <div className="form-grid">
              <div className="col-4">
                <TextInput
                  label="First Name"
                  required
                  value={profile.firstName}
                  isDirty={profile.firstName !== initialProfile.firstName}
                  error={profileErrors.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Last Name"
                  required
                  value={profile.lastName}
                  isDirty={profile.lastName !== initialProfile.lastName}
                  error={profileErrors.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Corporate Username"
                  required
                  value={profile.username}
                  isDirty={profile.username !== initialProfile.username}
                  isLoading={usernameChecking}
                  isValid={!usernameChecking && profile.username.length >= 3}
                  error={profileErrors.username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  helperText="Unique handle for incident audit trail attribution."
                />
              </div>

              <div className="col-6">
                <TextInput
                  label="Primary Work Email"
                  required
                  value={profile.email}
                  isDirty={profile.email !== initialProfile.email}
                  leadingIcon={<Mail size={14} />}
                  isValid={profile.email.includes('@')}
                  error={profileErrors.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  helperText="Primary email for SSO login and incident notifications."
                />
              </div>

              <div className="col-6">
                <TextInput
                  label="Secondary / Recovery Email"
                  value={profile.recoveryEmail}
                  isDirty={profile.recoveryEmail !== initialProfile.recoveryEmail}
                  leadingIcon={<Mail size={14} />}
                  onChange={(e) => setProfile({ ...profile, recoveryEmail: e.target.value })}
                  helperText="Used for automated break-glass recovery access."
                />
              </div>

              <div className="col-6">
                <TextInput
                  label="Emergency Escalation Phone"
                  value={profile.phone}
                  isDirty={profile.phone !== initialProfile.phone}
                  leadingIcon={<Smartphone size={14} />}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  helperText="Used for P1 Critical automated telephone escalation."
                />
              </div>

              <div className="col-6">
                <TextInput
                  label="Display Title / Role"
                  value={profile.title}
                  isDirty={profile.title !== initialProfile.title}
                  onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                  helperText="Shown on public incident response pages."
                />
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Organizational Department</label>
                  <select
                    className="form-control custom-select"
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                  >
                    <option value="Cloud Infrastructure & Security">Cloud Infrastructure & Security</option>
                    <option value="Site Reliability Engineering (SRE)">Site Reliability Engineering (SRE)</option>
                    <option value="Enterprise DevOps & Platform">Enterprise DevOps & Platform</option>
                    <option value="Product Engineering">Product Engineering</option>
                    <option value="SecOps Incident Response">SecOps Incident Response</option>
                  </select>
                </div>
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Operational Timezone</label>
                  <select
                    className="form-control custom-select"
                    value={profile.timezone}
                    onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  >
                    <option value="America/New_York (UTC-04:00)">America/New York (EDT - UTC-4)</option>
                    <option value="America/Los_Angeles (UTC-07:00)">America/Los Angeles (PDT - UTC-7)</option>
                    <option value="Europe/London (UTC+01:00)">Europe/London (BST - UTC+1)</option>
                    <option value="Asia/Tokyo (UTC+09:00)">Asia/Tokyo (JST - UTC+9)</option>
                  </select>
                </div>
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Platform UI Language</label>
                  <select
                    className="form-control custom-select"
                    value={profile.language}
                    onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                  >
                    <option value="en-US">English (US)</option>
                    <option value="de-DE">Deutsch (German)</option>
                    <option value="ja-JP">日本語 (Japanese)</option>
                    <option value="es-ES">Español (Spanish)</option>
                  </select>
                </div>
              </div>

              <div className="col-12">
                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label">Professional Summary & Bio</label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setBioPreview(!bioPreview)}
                    >
                      {bioPreview ? 'Edit Text' : 'Markdown Preview'}
                    </button>
                  </div>

                  {!bioPreview ? (
                    <textarea
                      rows={4}
                      className="form-control"
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      placeholder="Write a brief professional summary..."
                    />
                  ) : (
                    <div
                      style={{
                        padding: 12,
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        lineHeight: 1.5
                      }}
                    >
                      {profile.bio}
                    </div>
                  )}
                  <span className="form-helper-text">
                    Appears on internal engineering directory and change-review attributions.
                  </span>
                </div>
              </div>
            </div>

            {/* Sticky / Floating Form Actions */}
            <FormActionBar
              isDirty={isProfileDirty}
              isSubmitting={isSavingProfile}
              onSave={handleSaveProfile}
              onReset={() => setProfile(initialProfile)}
              saveLabel="Save Profile Changes"
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: SECURITY & PASSWORD
          ==================================================================== */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Change Password Card */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Lock size={18} color="var(--brand-primary)" />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Rotate Platform Password
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Rotating credentials terminates active sessions on unverified secondary devices.
                </p>
              </div>
            </div>

            {passwordError && (
              <div className="validation-summary" style={{ marginBottom: 16 }}>
                <div className="validation-summary-title">
                  <AlertCircle size={15} /> {passwordError}
                </div>
              </div>
            )}

            <div className="form-grid">
              <div className="col-4">
                <PasswordInput
                  label="Current Password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password..."
                />
              </div>

              <div className="col-4">
                <PasswordInput
                  label="New Password"
                  required
                  value={newPassword}
                  showStrengthMeter
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter high-entropy password..."
                />
              </div>

              <div className="col-4">
                <PasswordInput
                  label="Confirm New Password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password..."
                  isValid={confirmPassword.length > 0 && confirmPassword === newPassword}
                />
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSavePassword}
                disabled={isSavingPassword || !newPassword || !currentPassword}
              >
                <Save size={13} /> Update Password
              </button>
            </div>
          </div>

          {/* Two-Factor Authentication Status Card */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={20} color="var(--status-success)" />
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Two-Factor Authentication (2FA) Status
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    MFA is strictly enforced by organizational security policy (SOC2 CC6.1).
                  </span>
                </div>
              </div>

              <span className="nav-badge nav-badge-warning" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success-text)', borderColor: 'var(--status-success-border)' }}>
                Active & Enforced
              </span>
            </div>

            <div className="responsive-grid-equal">
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Hardware Security Key (FIDO2 / WebAuthn)
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--status-success-text)', fontWeight: 600 }}>Default</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                  YubiKey 5C NFC registered on March 15, 2024. Phishing-resistant cryptographic attestation.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() =>
                    addToast({
                      type: 'info',
                      title: 'WebAuthn Enrollment',
                      message: 'Insert your USB/NFC security key to register secondary hardware token.'
                    })
                  }
                >
                  <Plus size={12} /> Register Another Security Key
                </button>
              </div>

              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Authenticator App (TOTP)
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Backup</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                  Configured with 1Password / Google Authenticator 6-digit rolling code.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() =>
                    addToast({
                      type: 'info',
                      title: 'Recovery Codes',
                      message: '10 offline one-time emergency recovery codes generated.'
                    })
                  }
                >
                  Download Recovery Codes
                </button>
              </div>
            </div>
          </div>

          {/* Active Sessions List */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Active Authentication Sessions
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Devices currently authenticated into the mission control control plane.
                </span>
              </div>

              {sessions.length > 1 && (
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={handleRevokeAllOtherSessions}
                >
                  <Lock size={12} /> Revoke All Other Sessions
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Laptop size={18} color="var(--brand-primary)" />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {sess.device}
                        </span>
                        {sess.isCurrent && (
                          <span className="nav-badge nav-badge-warning" style={{ background: 'var(--status-success-bg)', color: 'var(--status-success-text)', fontSize: 10 }}>
                            This Browser
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        IP: {sess.ip} · {sess.location} · {sess.lastActive}
                      </span>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => handleRevokeSession(sess.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: NOTIFICATIONS & ROUTING
          ==================================================================== */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Notification Delivery Channels
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Granularly configure which events route to email, Slack webhooks, or urgent SMS.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  addToast({
                    type: 'success',
                    title: 'Preferences Saved',
                    message: 'Notification routing channels updated across all clusters.'
                  })
                }
              >
                <Save size={13} /> Save Preferences
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '16px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-critical-text)', display: 'block', marginBottom: 4 }}>
                  P1 / Critical Security Incidents & Outages
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>
                  Immediate notification for active data breach alerts, edge proxy outages, and zero-day patches.
                </span>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <ToggleSwitch
                    checked={notifications.criticalIncidentsEmail}
                    onChange={(val) => setNotifications({ ...notifications, criticalIncidentsEmail: val })}
                    title="Corporate Email"
                  />
                  <ToggleSwitch
                    checked={notifications.criticalIncidentsSlack}
                    onChange={(val) => setNotifications({ ...notifications, criticalIncidentsSlack: val })}
                    title="Slack #secops-alerts"
                  />
                  <ToggleSwitch
                    checked={notifications.criticalIncidentsSms}
                    onChange={(val) => setNotifications({ ...notifications, criticalIncidentsSms: val })}
                    title="Emergency SMS Broadcast"
                  />
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Vulnerability & Compliance Audits
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>
                  Weekly automated SOC2 posture reports, stale API key flags, and container scanner results.
                </span>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <ToggleSwitch
                    checked={notifications.securityVulnerabilitiesEmail}
                    onChange={(val) => setNotifications({ ...notifications, securityVulnerabilitiesEmail: val })}
                    title="Corporate Email"
                  />
                  <ToggleSwitch
                    checked={notifications.securityVulnerabilitiesSlack}
                    onChange={(val) => setNotifications({ ...notifications, securityVulnerabilitiesSlack: val })}
                    title="Slack Notification"
                  />
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 4 }}>
                  Quiet Hours & Do-Not-Disturb Schedule
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 12 }}>
                  Suppresses non-critical alerts between your specified hours in America/New_York (EDT).
                </span>
                <ToggleSwitch
                  checked={quietHours}
                  onChange={setQuietHours}
                  title="Enforce Quiet Hours (Excluding P1 Emergencies)"
                />

                {quietHours && (
                  <div className="responsive-grid-equal" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <TimePickerDropdown
                      label="Quiet Hours Start Time"
                      value={quietHoursStart}
                      onChange={setQuietHoursStart}
                      helperText="Non-critical alerts will be silenced starting at this time."
                    />
                    <TimePickerDropdown
                      label="Quiet Hours End Time"
                      value={quietHoursEnd}
                      onChange={setQuietHoursEnd}
                      helperText="Standard notification dispatch resumes at this time."
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 4: DEVELOPER API TOKENS
          ==================================================================== */}
      {activeTab === 'tokens' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Personal Access Tokens (PAT)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Authenticate programmatic CLI, Terraform, and automated CI/CD runners into the control plane.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setGeneratedRawToken(null);
                  setNewTokenName('');
                  setShowNewTokenModal(true);
                }}
              >
                <Plus size={13} /> Generate New Token
              </button>
            </div>

            {/* Generated Raw Token Alert if just created */}
            {generatedRawToken && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid var(--status-success-border)',
                  borderRadius: 6,
                  padding: 16,
                  marginBottom: 16
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-success-text)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                  <CheckCircle2 size={16} /> Token Generated Successfully
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                  Make sure to copy this token now. You will not be able to see it again once you navigate away.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    className="form-control font-mono"
                    value={generatedRawToken}
                    style={{ flex: 1, color: 'var(--status-success-text)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedRawToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                  >
                    {copiedToken ? <Check size={13} color="var(--status-success)" /> : <Copy size={13} />}
                    {copiedToken ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Existing Tokens List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tokens.map((token) => (
                <div
                  key={token.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {token.name}
                      </span>
                      <span className="form-char-count font-mono" style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 3 }}>
                        {token.tokenPrefix}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <span>Created {token.created}</span>
                      <span>Expires {token.expires}</span>
                      <span>Last used {token.lastUsed}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {token.scopes.map((sc) => (
                        <span key={sc} className="tag-chip" style={{ fontSize: 10 }}>
                          {sc}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setTokens(tokens.filter((t) => t.id !== token.id));
                      addToast({
                        type: 'warning',
                        title: 'Token Revoked',
                        message: `Token "${token.name}" has been permanently invalidated.`
                      });
                    }}
                  >
                    <Trash2 size={12} color="var(--status-critical-text)" /> Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* New Token Modal */}
          {showNewTokenModal && !generatedRawToken && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)'
              }}
            >
              <div
                style={{
                  width: 500,
                  maxWidth: '90%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-emphasis)',
                  borderRadius: 8,
                  padding: 24,
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                  Generate New Personal Access Token
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <TextInput
                    label="Token Description / Name"
                    required
                    placeholder="e.g. Jenkins Runner or Local Terraform"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                  />

                  <div className="form-group">
                    <label className="form-label">Expiration Lifetime</label>
                    <select
                      className="form-control custom-select"
                      value={newTokenExpiry}
                      onChange={(e) => setNewTokenExpiry(e.target.value)}
                    >
                      <option value="30">30 Days (Recommended)</option>
                      <option value="60">60 Days</option>
                      <option value="90">90 Days</option>
                      <option value="365">1 Year</option>
                      <option value="custom">Pick Specific Calendar Date...</option>
                    </select>
                  </div>

                  {newTokenExpiry === 'custom' && (
                    <DatePickerDropdown
                      label="Exact Token Expiry Date"
                      value={customTokenExpiryDate}
                      onChange={setCustomTokenExpiryDate}
                      helperText="Token will automatically become unauthorized at 23:59:59 UTC on this date."
                    />
                  )}

                  <div className="form-group">
                    <label className="form-label">Permission Scopes</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newTokenScopes.includes('read:audit')}
                          onChange={(e) => {
                            if (e.target.checked) setNewTokenScopes([...newTokenScopes, 'read:audit']);
                            else setNewTokenScopes(newTokenScopes.filter((s) => s !== 'read:audit'));
                          }}
                        />
                        <span>read:audit (View SIEM logs & security ledger)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newTokenScopes.includes('write:workflows')}
                          onChange={(e) => {
                            if (e.target.checked) setNewTokenScopes([...newTokenScopes, 'write:workflows']);
                            else setNewTokenScopes(newTokenScopes.filter((s) => s !== 'write:workflows'));
                          }}
                        />
                        <span>write:workflows (Trigger and cancel CI/CD pipelines)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newTokenScopes.includes('admin:infrastructure')}
                          onChange={(e) => {
                            if (e.target.checked) setNewTokenScopes([...newTokenScopes, 'admin:infrastructure']);
                            else setNewTokenScopes(newTokenScopes.filter((s) => s !== 'admin:infrastructure'));
                          }}
                        />
                        <span>admin:infrastructure (Provision and destroy clusters)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowNewTokenModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!newTokenName.trim()}
                    onClick={handleCreateToken}
                  >
                    Generate Token
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 5: DANGER ZONE
          ==================================================================== */}
      {activeTab === 'danger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--status-critical-border)',
              borderRadius: 6,
              padding: 24
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <AlertOctagon size={20} color="var(--status-critical)" />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--status-critical-text)', margin: 0 }}>
                  Danger Zone & Account Governance
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Irreversible administrative operations impacting your enterprise identity and cluster access.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Transfer Ownership */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                    Transfer Super Admin Ownership
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Designate another verified administrator to assume Root and Master billing authority.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    addToast({
                      type: 'warning',
                      title: 'Transfer Workflow',
                      message: 'Select an administrator from the Users roster to initiate dual-custody transfer.'
                    })
                  }
                >
                  Transfer Ownership
                </button>
              </div>

              {/* Deactivate Account */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid var(--status-critical-border)',
                  borderRadius: 6
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-critical-text)', display: 'block' }}>
                    Deactivate Profile & Revoke All Credentials
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Instantly invalidates all API keys, active SSO sessions, and locks console access.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setShowDeleteModal(true)}
                >
                  Deactivate Account
                </button>
              </div>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)'
              }}
            >
              <div
                style={{
                  width: 440,
                  maxWidth: '90%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--status-critical-border)',
                  borderRadius: 8,
                  padding: 24,
                  boxShadow: 'var(--shadow-lg)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--status-critical-text)', marginBottom: 12 }}>
                  <AlertOctagon size={22} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Confirm Account Deactivation</h3>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                  This action is permanent and will revoke your access to all Acme Corporation Kubernetes clusters, audit ledgers, and API keys.
                </p>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>
                    Type <strong style={{ color: 'var(--text-primary)' }}>delete {profile.username}</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    className="form-control font-mono"
                    placeholder={`delete ${profile.username}`}
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirmText('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={deleteConfirmText !== `delete ${profile.username}`}
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteConfirmText('');
                      addToast({
                        type: 'error',
                        title: 'Account Deactivated',
                        message: 'Credentials revoked. Redirecting to Enterprise Identity Provider SSO...'
                      });
                    }}
                  >
                    Permanently Deactivate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
