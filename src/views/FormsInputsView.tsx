import React, { useState } from 'react';
import {
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Mail,
  Lock,
  Hash,
  DollarSign,
  Copy,
  Server,
  Layers,
  RefreshCw,
  Zap,
  Check,
  Shield,
  Sliders,
  UploadCloud,
  Calendar,
} from 'lucide-react';
import {
  TextInput,
  PasswordInput,
  ToggleSwitch,
  RangeSlider,
  TagInput,
  Dropzone,
  FormActionBar,
  UploadedFileItem
} from '../components/forms/FormControls';
import {
  DatePickerDropdown,
  DateRangePickerDropdown,
  TimePickerDropdown,
  DateTimePickerDropdown
} from '../components/forms/DateTimePicker';
import { useApp } from '../context/AppContext';

export const FormsInputsView: React.FC = () => {
  const { addToast } = useApp();

  // Active Catalog Tab
  const [activeTab, setActiveTab] = useState<'inputs' | 'validation' | 'patterns'>('inputs');

  // Input Catalog Live States
  const [textVal, setTextVal] = useState('Production Cluster Delta');
  const [emailVal, setEmailVal] = useState('ops-lead@enterprise.acme.com');
  const [clearableVal, setClearableVal] = useState('Click the X button on the right to clear me');
  const [counterVal, setCounterVal] = useState('Mission-critical microservice deployment');
  const [floatingVal, setFloatingVal] = useState('High-throughput VPC Peering');
  const [monoVal] = useState('pk_live_51Msz82Kj92Lm81NxQp');
  const [copiedKey, setCopiedKey] = useState(false);
  const [passwordVal, setPasswordVal] = useState('CyberShield#2026');
  const [currencyVal, setCurrencyVal] = useState('14500');
  const [stepperVal, setStepperVal] = useState(4);
  const [sliderVal, setSliderVal] = useState(75);
  const [tags, setTags] = useState(['soc2-compliant', 'us-east-1', 'high-availability']);
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'enterprise' | 'custom'>('enterprise');
  const [segmentedEnv, setSegmentedEnv] = useState<'dev' | 'staging' | 'production'>('production');

  // Dates, Times & Calendar States
  const [singleDate, setSingleDate] = useState('2026-09-10');
  const [rangeStart, setRangeStart] = useState('2026-09-01');
  const [rangeEnd, setRangeEnd] = useState('2026-09-10');
  const [selectedTime, setSelectedTime] = useState('09:30 AM');
  const [maintenanceDate, setMaintenanceDate] = useState('2026-09-15');
  const [maintenanceTime, setMaintenanceTime] = useState('02:00 AM');

  // Toggles
  const [toggle1, setToggle1] = useState(true);
  const [toggle2, setToggle2] = useState(false);
  const [toggle3, setToggle3] = useState(false);

  // Files
  const [files, setFiles] = useState<UploadedFileItem[]>([
    {
      id: 'f-1',
      name: 'tls-wildcard-cert.pem',
      size: '2.4 KB',
      progress: 100,
      status: 'completed'
    },
    {
      id: 'f-2',
      name: 'saml-metadata-idp.xml',
      size: '14.8 KB',
      progress: 100,
      status: 'completed'
    }
  ]);

  // Markdown note
  const [noteTab, setNoteTab] = useState<'write' | 'preview'>('write');
  const [markdownText, setMarkdownText] = useState(
    '### Change Governance Checklist\n- [x] Tested in Staging sandbox\n- [x] Zero-downtime rolling update enabled\n- [ ] Approval from SecOps Officer'
  );

  // Playground Form State (Validation & Actions)
  const initialForm = {
    serviceName: 'telemetry-collector-v2',
    ownerEmail: 'lead@missioncontrol.io',
    instanceCount: '8',
    region: 'us-east-1',
    password: 'SecureKey$2026',
    confirmPassword: 'SecureKey$2026',
    autoScale: true,
    drainTimeout: 60,
    backupRetention: '365'
  };

  const [formData, setFormData] = useState(initialForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');

  // Check dirty state
  const isFormDirty = JSON.stringify(formData) !== JSON.stringify(initialForm);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(monoVal);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
    addToast({
      type: 'info',
      title: 'Copied to Clipboard',
      message: 'API Key copied to system clipboard.'
    });
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.serviceName.trim()) {
      errors.serviceName = 'Service identifier is required.';
    } else if (formData.serviceName.length < 4) {
      errors.serviceName = 'Service identifier must be at least 4 characters.';
    }

    if (!formData.ownerEmail.trim()) {
      errors.ownerEmail = 'Owner email is required.';
    } else if (!formData.ownerEmail.includes('@') || !formData.ownerEmail.includes('.')) {
      errors.ownerEmail = 'Must provide a valid enterprise corporate email.';
    }

    if (!formData.password) {
      errors.password = 'Authentication token or password is required.';
    } else if (formData.password.length < 10) {
      errors.password = 'Password must meet SOC2 minimum length of 10 characters.';
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Password confirmation does not match.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveForm = () => {
    if (!validateForm()) {
      addToast({
        type: 'error',
        title: 'Validation Failed',
        message: 'Please resolve errors highlighted in the form before saving.'
      });
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      addToast({
        type: 'success',
        title: 'Configuration Deployed',
        message: 'Service changes successfully persisted to the distributed control plane.'
      });
    }, 900);
  };

  const handleResetForm = () => {
    setFormData(initialForm);
    setFormErrors({});
    addToast({
      type: 'info',
      title: 'Changes Discarded',
      message: 'Form restored to pristine initial state.'
    });
  };

  return (
    <div className="view-container" style={{ paddingBottom: 60 }}>
      {/* View Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 className="view-title">Forms & Input Component Showcase</h1>
            <span className="nav-badge nav-badge-neutral" style={{ background: 'var(--brand-subtle)', color: 'var(--text-accent)' }}>
              Interactive System
            </span>
          </div>
          <p className="view-subtitle">
            Comprehensive design patterns for enterprise data capture, real-time validations, state lifecycles, and action toolbars.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="segmented-control">
          <button
            className={`segmented-btn ${activeTab === 'inputs' ? 'active' : ''}`}
            onClick={() => setActiveTab('inputs')}
          >
            <Sliders size={13} style={{ display: 'inline', marginRight: 4 }} />
            Input Controls Catalog
          </button>
          <button
            className={`segmented-btn ${activeTab === 'validation' ? 'active' : ''}`}
            onClick={() => setActiveTab('validation')}
          >
            <CheckCircle2 size={13} style={{ display: 'inline', marginRight: 4 }} />
            Validation & Actions Flow
          </button>
          <button
            className={`segmented-btn ${activeTab === 'patterns' ? 'active' : ''}`}
            onClick={() => setActiveTab('patterns')}
          >
            <Layers size={13} style={{ display: 'inline', marginRight: 4 }} />
            Card & Layout Patterns
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: INPUT CONTROLS CATALOG
          ==================================================================== */}
      {activeTab === 'inputs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 1: Standard & Decorated Text Inputs */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <FileCode2 size={18} color="var(--brand-primary)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Text Inputs & Variant Modifiers
              </h3>
            </div>

            <div className="form-grid">
              <div className="col-4">
                <TextInput
                  label="Standard Text Input"
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  placeholder="Enter cluster designation..."
                  helperText="Default standard text field with subtle focus glow."
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Leading Icon & Validation"
                  value={emailVal}
                  onChange={(e) => setEmailVal(e.target.value)}
                  leadingIcon={<Mail size={15} />}
                  isValid={emailVal.includes('@')}
                  helperText="Displays leading icon and green validation checkmark."
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Clearable Field with Action"
                  value={clearableVal}
                  onChange={(e) => setClearableVal(e.target.value)}
                  isClearable
                  onClear={() => setClearableVal('')}
                  helperText="Trailing action button empties input value."
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Character Counter Limit"
                  value={counterVal}
                  onChange={(e) => setCounterVal(e.target.value)}
                  maxLength={50}
                  showCount
                  helperText="Enforces max characters and displays live counter."
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Floating Label Variant"
                  value={floatingVal}
                  onChange={(e) => setFloatingVal(e.target.value)}
                  floatingLabel
                  helperText="Modern floating label within border bounding box."
                />
              </div>

              <div className="col-4">
                <TextInput
                  label="Monospace Key with One-Click Copy"
                  value={monoVal}
                  readOnly
                  className="font-mono"
                  leadingIcon={<Lock size={14} />}
                  trailingIcon={
                    <button
                      type="button"
                      className="input-action-btn"
                      onClick={handleCopyKey}
                      title="Copy API Key"
                    >
                      {copiedKey ? <Check size={14} color="var(--status-success)" /> : <Copy size={14} />}
                    </button>
                  }
                  helperText={copiedKey ? 'Copied to clipboard!' : 'Readonly credentials with copy action.'}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Password with Live Entropy Meter */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Lock size={18} color="var(--status-approval)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Password Field with Real-Time Cryptographic Strength Meter
              </h3>
            </div>

            <div className="form-grid">
              <div className="col-6">
                <PasswordInput
                  label="Secure Password / Secret Key"
                  value={passwordVal}
                  onChange={(e) => setPasswordVal(e.target.value)}
                  showStrengthMeter
                  helperText="Includes eye toggle for visibility and live entropy calculation."
                />
              </div>

              <div className="col-6">
                <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                    Enterprise Password Policy Compliance
                  </span>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    Our cryptographic assessment evaluates entropy against NIST SP 800-63B guidelines.
                    Passwords must contain uppercase characters, numerical digits, and enterprise special characters.
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setPasswordVal('Pass123')}
                    >
                      Test Weak
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setPasswordVal('MissionControl#99')}
                    >
                      Test Strong
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Date, Time & Calendar Dropdowns */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="var(--brand-primary)" />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Date, Time & Calendar Dropdown Components
                </h3>
              </div>
              <span className="nav-badge nav-badge-warning" style={{ background: 'var(--brand-subtle)', color: 'var(--text-accent)' }}>
                Interactive Popups
              </span>
            </div>

            <div className="form-grid">
              <div className="col-6">
                <DatePickerDropdown
                  label="Single Date Picker (with Calendar Dropdown)"
                  value={singleDate}
                  onChange={setSingleDate}
                  placeholder="Select deployment date..."
                  helperText="Interactive month/year selector, quick presets (Today, Tomorrow, +7d, +30d), and active day highlight."
                />
              </div>

              <div className="col-6">
                <DateRangePickerDropdown
                  label="Date Range Span Picker (Start & End Range)"
                  startDate={rangeStart}
                  endDate={rangeEnd}
                  onChange={(s, e) => {
                    setRangeStart(s);
                    setRangeEnd(e);
                  }}
                  helperText="Quick presets (Today, Last 7d, Last 30d, Quarter) with continuous highlighted date range."
                />
              </div>

              <div className="col-6">
                <TimePickerDropdown
                  label="Execution Time Picker (Hours, Minutes, AM/PM)"
                  value={selectedTime}
                  onChange={setSelectedTime}
                  helperText="Scrollable column selectors, AM/PM toggle, and quick time shortcut chips."
                />
              </div>

              <div className="col-6">
                <DateTimePickerDropdown
                  label="Combined Maintenance Window Scheduler (Date + Time)"
                  dateValue={maintenanceDate}
                  timeValue={maintenanceTime}
                  onChange={(d, t) => {
                    setMaintenanceDate(d);
                    setMaintenanceTime(t);
                  }}
                  helperText="Unified date selection with operational release window presets."
                />
              </div>
            </div>
          </div>

          {/* Section 4: Sliders, Numbers, Selects & Tags */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Hash size={18} color="var(--status-info)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Numeric, Selectors, Range & Tag Inputs
              </h3>
            </div>

            <div className="form-grid">
              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Currency Formatted Field</label>
                  <div className="form-input-wrapper">
                    <div className="input-leading-icon">
                      <DollarSign size={15} />
                    </div>
                    <input
                      type="number"
                      className="form-control has-leading-icon"
                      value={currencyVal}
                      onChange={(e) => setCurrencyVal(e.target.value)}
                    />
                    <div className="input-trailing-icon">
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>USD</span>
                    </div>
                  </div>
                  <span className="form-helper-text">Monthly allocated infrastructure budget cap.</span>
                </div>
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Replica Stepper Counter</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 36, height: 36, padding: 0 }}
                      onClick={() => setStepperVal(Math.max(1, stepperVal - 1))}
                    >
                      -
                    </button>
                    <input
                      type="text"
                      className="form-control font-mono"
                      style={{ textAlign: 'center', fontWeight: 700 }}
                      value={`${stepperVal} Replicas`}
                      readOnly
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 36, height: 36, padding: 0 }}
                      onClick={() => setStepperVal(Math.min(32, stepperVal + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="form-helper-text">Container cluster worker scaling limits.</span>
                </div>
              </div>

              <div className="col-4">
                <RangeSlider
                  label="CPU Throttle Limit"
                  value={sliderVal}
                  min={10}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={setSliderVal}
                  helperText="Dynamically adjusts pod compute throttle thresholds."
                />
              </div>

              <div className="col-6">
                <div className="form-group">
                  <label className="form-label">Custom Select Dropdown</label>
                  <select className="form-control custom-select">
                    <option value="us-east-1">US East (N. Virginia) · Tier 1 High Latency SLA</option>
                    <option value="us-west-2">US West (Oregon) · Disaster Recovery Backup</option>
                    <option value="eu-west-1">EU (Ireland) · GDPR Compliant Sovereign Vault</option>
                    <option value="ap-southeast-1">Asia Pacific (Singapore) · Edge PoP</option>
                  </select>
                  <span className="form-helper-text">Native accessible styled selector with custom arrow icon.</span>
                </div>
              </div>

              <div className="col-6">
                <TagInput
                  label="Resource Categorization Tags"
                  tags={tags}
                  onChange={setTags}
                  helperText="Press Enter or comma to create new tags; backspace removes last."
                />
              </div>
            </div>
          </div>

          {/* Section 4: Toggles, File Dropzone & Rich Markdown Textarea */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <UploadCloud size={18} color="var(--brand-primary)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Switches, Drag-and-Drop Dropzone & Markdown Note Editor
              </h3>
            </div>

            <div className="form-grid">
              <div className="col-4" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ToggleSwitch
                  checked={toggle1}
                  onChange={setToggle1}
                  title="Automated Failover Routing"
                  description="Reroute incoming edge traffic on health check failure"
                  badge="Recommended"
                />

                <ToggleSwitch
                  checked={toggle2}
                  onChange={setToggle2}
                  title="Audit Event Streaming"
                  description="Stream audit trails to external Splunk SIEM"
                />

                <ToggleSwitch
                  checked={toggle3}
                  onChange={setToggle3}
                  variant="danger"
                  title="Bypass Security Guardrails"
                  description="Permit non-attested containers in hot clusters"
                  badge="Destructive"
                />
              </div>

              <div className="col-4">
                <Dropzone
                  label="Cryptographic Identity & Certificates"
                  files={files}
                  onUpload={(newF) => setFiles((prev) => [...prev, newF])}
                  onRemove={(id) => setFiles((prev) => prev.filter((f) => f.id !== id))}
                  helperText="Accepts .pem, .crt, .json or .xml security artifacts."
                />
              </div>

              <div className="col-4">
                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label">Markdown Change Notes</label>
                    <div className="segmented-control" style={{ padding: 2 }}>
                      <button
                        type="button"
                        className={`segmented-btn ${noteTab === 'write' ? 'active' : ''}`}
                        onClick={() => setNoteTab('write')}
                        style={{ fontSize: 10, padding: '2px 8px' }}
                      >
                        Write
                      </button>
                      <button
                        type="button"
                        className={`segmented-btn ${noteTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setNoteTab('preview')}
                        style={{ fontSize: 10, padding: '2px 8px' }}
                      >
                        Preview
                      </button>
                    </div>
                  </div>

                  {noteTab === 'write' ? (
                    <textarea
                      rows={5}
                      className="form-control font-mono"
                      value={markdownText}
                      onChange={(e) => setMarkdownText(e.target.value)}
                      placeholder="Write release notes in Markdown format..."
                      style={{ resize: 'vertical' }}
                    />
                  ) : (
                    <div
                      style={{
                        minHeight: 110,
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        fontSize: 12,
                        color: 'var(--text-primary)'
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Change Governance Checklist</div>
                      <div style={{ color: 'var(--text-secondary)' }}>• Tested in Staging sandbox (Done)</div>
                      <div style={{ color: 'var(--text-secondary)' }}>• Zero-downtime rolling update enabled (Done)</div>
                      <div style={{ color: 'var(--status-warning-text)' }}>• Pending SecOps approval</div>
                    </div>
                  )}
                  <span className="form-helper-text">Includes live client-side Markdown preview switch.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: VALIDATION & ACTIONS FLOW
          ==================================================================== */}
      {activeTab === 'validation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Validation Summary Callout if errors exist */}
          {Object.keys(formErrors).length > 0 && (
            <div className="validation-summary">
              <div className="validation-summary-title">
                <AlertCircle size={16} />
                Please correct {Object.keys(formErrors).length} configuration error(s) before saving:
              </div>
              <ul className="validation-summary-list">
                {Object.entries(formErrors).map(([key, msg]) => (
                  <li key={key}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Configuration Form Card */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  High-Availability Microservice Specs
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Demonstrating live dirty state tracking, field error states, and sticky action lifecycle.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      serviceName: '',
                      ownerEmail: 'invalid-email',
                      password: '123'
                    });
                    validateForm();
                  }}
                >
                  <AlertTriangle size={12} color="var(--status-critical-text)" />
                  Simulate Validation Errors
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleResetForm}
                >
                  <RefreshCw size={12} />
                  Restore Clean Baseline
                </button>
              </div>
            </div>

            <div className="form-grid">
              <div className="col-6">
                <TextInput
                  label="Service Cluster Identifier"
                  required
                  value={formData.serviceName}
                  isDirty={formData.serviceName !== initialForm.serviceName}
                  error={formErrors.serviceName}
                  isValid={formData.serviceName.length >= 4 && !formErrors.serviceName}
                  onChange={(e) => {
                    setFormData({ ...formData, serviceName: e.target.value });
                    if (formErrors.serviceName) {
                      setFormErrors({ ...formErrors, serviceName: '' });
                    }
                  }}
                  helperText="Unique identifier within Kubernetes namespace."
                />
              </div>

              <div className="col-6">
                <TextInput
                  label="Service Owner Corporate Email"
                  required
                  value={formData.ownerEmail}
                  isDirty={formData.ownerEmail !== initialForm.ownerEmail}
                  error={formErrors.ownerEmail}
                  isValid={formData.ownerEmail.includes('@') && !formErrors.ownerEmail}
                  leadingIcon={<Mail size={14} />}
                  onChange={(e) => {
                    setFormData({ ...formData, ownerEmail: e.target.value });
                    if (formErrors.ownerEmail) {
                      setFormErrors({ ...formErrors, ownerEmail: '' });
                    }
                  }}
                  helperText="Primary point of escalation for incident triage."
                />
              </div>

              <div className="col-6">
                <PasswordInput
                  label="Service Mesh Mutual-TLS Secret"
                  required
                  value={formData.password}
                  isDirty={formData.password !== initialForm.password}
                  error={formErrors.password}
                  showStrengthMeter
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (formErrors.password) {
                      setFormErrors({ ...formErrors, password: '' });
                    }
                  }}
                />
              </div>

              <div className="col-6">
                <PasswordInput
                  label="Confirm Mutual-TLS Secret"
                  required
                  value={formData.confirmPassword}
                  isDirty={formData.confirmPassword !== initialForm.confirmPassword}
                  error={formErrors.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (formErrors.confirmPassword) {
                      setFormErrors({ ...formErrors, confirmPassword: '' });
                    }
                  }}
                  helperText="Must match Secret specified on the left."
                />
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Target Cloud Region</label>
                  <select
                    className="form-control custom-select"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  >
                    <option value="us-east-1">US East (N. Virginia)</option>
                    <option value="us-west-2">US West (Oregon)</option>
                    <option value="eu-west-1">EU (Ireland)</option>
                  </select>
                </div>
              </div>

              <div className="col-4">
                <div className="form-group">
                  <label className="form-label">Audit Log Retention Policy</label>
                  <select
                    className="form-control custom-select"
                    value={formData.backupRetention}
                    onChange={(e) => setFormData({ ...formData, backupRetention: e.target.value })}
                  >
                    <option value="90">90 Days (Standard Tier)</option>
                    <option value="365">365 Days (SOC2 Mandate)</option>
                    <option value="2555">7 Years (Immutable Vault)</option>
                  </select>
                </div>
              </div>

              <div className="col-4">
                <RangeSlider
                  label="Connection Drain Timeout"
                  value={formData.drainTimeout}
                  min={10}
                  max={180}
                  step={10}
                  unit="s"
                  onChange={(val) => setFormData({ ...formData, drainTimeout: val })}
                  helperText="Grace period before killing ongoing HTTP connections."
                />
              </div>

              <div className="col-12" style={{ paddingTop: 8 }}>
                <ToggleSwitch
                  checked={formData.autoScale}
                  onChange={(checked) => setFormData({ ...formData, autoScale: checked })}
                  title="Autonomous Elastic Pod Autoscaling (HPA)"
                  description="Automatically scale pod count based on incoming traffic spikes."
                  badge="Kubernetes HPA"
                />
              </div>
            </div>

            {/* Live Form Actions Bar */}
            <FormActionBar
              isDirty={isFormDirty}
              isSubmitting={isSubmitting}
              onSave={handleSaveForm}
              onReset={handleResetForm}
              lastSavedText={`Persisted at ${lastSavedTime}`}
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: CARD & SELECTION PATTERNS
          ==================================================================== */}
      {activeTab === 'patterns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card Selection Grid */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Layers size={18} color="var(--brand-primary)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Tile & Card Radio Selection Pattern
              </h3>
            </div>

            <div className="card-selector-grid">
              <div
                className={`selection-card ${selectedPlan === 'standard' ? 'selected' : ''}`}
                onClick={() => setSelectedPlan('standard')}
              >
                <div className="selection-card-icon">
                  <Server size={18} />
                </div>
                <div className="selection-card-content">
                  <div className="selection-card-title">
                    <span>Standard Node</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>$49/mo</span>
                  </div>
                  <span className="selection-card-desc">
                    Shared control plane with 4 vCPU and 16GB RAM for testing and QA pipelines.
                  </span>
                </div>
              </div>

              <div
                className={`selection-card ${selectedPlan === 'enterprise' ? 'selected' : ''}`}
                onClick={() => setSelectedPlan('enterprise')}
              >
                <div className="selection-card-icon">
                  <Shield size={18} />
                </div>
                <div className="selection-card-content">
                  <div className="selection-card-title">
                    <span>Dedicated Cluster</span>
                    <span className="nav-badge nav-badge-warning" style={{ fontSize: 10 }}>Popular</span>
                  </div>
                  <span className="selection-card-desc">
                    Single-tenant isolated VPC with SOC2 Type II compliance and 99.99% SLA.
                  </span>
                </div>
              </div>

              <div
                className={`selection-card ${selectedPlan === 'custom' ? 'selected' : ''}`}
                onClick={() => setSelectedPlan('custom')}
              >
                <div className="selection-card-icon">
                  <Zap size={18} />
                </div>
                <div className="selection-card-content">
                  <div className="selection-card-title">
                    <span>Bare Metal Sovereign</span>
                    <span style={{ fontSize: 11, color: 'var(--text-accent)' }}>Contact</span>
                  </div>
                  <span className="selection-card-desc">
                    Hardware HSM key storage, private fiber interconnects, and air-gapped topology.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Segmented Control Selector */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Sliders size={18} color="var(--status-info)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Segmented Environmental Control Pill
              </h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Ideal for compact option toggling such as environments, deployment strategies, and visual densities.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn ${segmentedEnv === 'dev' ? 'active' : ''}`}
                  onClick={() => setSegmentedEnv('dev')}
                >
                  Development
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${segmentedEnv === 'staging' ? 'active' : ''}`}
                  onClick={() => setSegmentedEnv('staging')}
                >
                  Staging Sandbox
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${segmentedEnv === 'production' ? 'active' : ''}`}
                  onClick={() => setSegmentedEnv('production')}
                >
                  Production Primary
                </button>
              </div>

              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Active Target: <strong style={{ color: 'var(--text-primary)' }}>{segmentedEnv.toUpperCase()}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
