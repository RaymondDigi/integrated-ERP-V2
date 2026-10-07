import React, { useState, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  X,
  Loader2,
  UploadCloud,
  FileText,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

/* ==========================================================================
   Text Input Component
   ========================================================================== */
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  warning?: string;
  isValid?: boolean;
  isLoading?: boolean;
  isDirty?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  isClearable?: boolean;
  onClear?: () => void;
  showCount?: boolean;
  floatingLabel?: boolean;
  extraLabel?: React.ReactNode;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  helperText,
  error,
  warning,
  isValid,
  isLoading,
  isDirty,
  leadingIcon,
  trailingIcon,
  isClearable,
  onClear,
  showCount,
  maxLength,
  floatingLabel,
  extraLabel,
  required,
  value,
  onChange,
  className = '',
  disabled,
  readOnly,
  id,
  ...rest
}) => {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const currentLength = typeof value === 'string' ? value.length : 0;

  return (
    <div className={`form-group ${className}`}>
      {label && !floatingLabel && (
        <div className="form-label-row">
          <label htmlFor={inputId} className="form-label">
            {label}
            {required && <span className="required-star">*</span>}
            {isDirty && (
              <span
                className="form-label-dirty-indicator"
                title="Field modified from original value"
              />
            )}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {extraLabel}
            {showCount && maxLength && (
              <span className="form-char-count">
                {currentLength}/{maxLength}
              </span>
            )}
          </div>
        </div>
      )}

      <div className={floatingLabel ? 'form-floating-wrapper' : 'form-input-wrapper'}>
        {leadingIcon && <div className="input-leading-icon">{leadingIcon}</div>}

        <input
          id={inputId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          required={required}
          className={`form-control ${floatingLabel ? 'form-floating-input' : ''} ${
            leadingIcon ? 'has-leading-icon' : ''
          } ${trailingIcon || isClearable || isLoading || isValid || error || warning ? 'has-trailing-icon' : ''} ${
            error ? 'is-invalid' : ''
          } ${!error && isValid ? 'is-valid' : ''} ${!error && !isValid && warning ? 'is-warning' : ''}`}
          {...rest}
        />

        {floatingLabel && label && (
          <label htmlFor={inputId} className="form-floating-label">
            {label} {required && '*'}
          </label>
        )}

        <div className="input-trailing-icon">
          {isLoading && <Loader2 size={15} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />}
          {!isLoading && isClearable && value && !disabled && !readOnly && (
            <button
              type="button"
              className="input-action-btn"
              onClick={onClear}
              title="Clear input"
              aria-label="Clear input"
            >
              <X size={14} />
            </button>
          )}
          {!isLoading && error && <AlertCircle size={15} color="var(--status-critical)" />}
          {!isLoading && !error && isValid && <Check size={15} color="var(--status-success)" />}
          {!isLoading && !error && !isValid && warning && <AlertTriangle size={15} color="var(--status-warning)" />}
          {trailingIcon && !error && !isValid && !warning && !isLoading && trailingIcon}
        </div>
      </div>

      {error && (
        <div className="form-error-text">
          <AlertCircle size={13} /> {error}
        </div>
      )}
      {!error && warning && (
        <div className="form-warning-text">
          <AlertTriangle size={13} /> {warning}
        </div>
      )}
      {!error && !warning && helperText && <div className="form-helper-text">{helperText}</div>}
    </div>
  );
};

/* ==========================================================================
   Password Input with Live Strength Meter
   ========================================================================== */
export interface PasswordInputProps extends Omit<TextInputProps, 'type' | 'leadingIcon' | 'trailingIcon'> {
  showStrengthMeter?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value = '',
  showStrengthMeter = false,
  label = 'Password',
  ...rest
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const passwordStr = String(value || '');

  // Calculate Password Strength
  const hasMinLength = passwordStr.length >= 10;
  const hasUppercase = /[A-Z]/.test(passwordStr);
  const hasNumber = /[0-9]/.test(passwordStr);
  const hasSpecial = /[^A-Za-z0-9]/.test(passwordStr);

  const criteriaMet = [hasMinLength, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length;
  
  let strengthLabel = 'Too Weak';
  let strengthClass = 'active-weak';
  if (passwordStr.length === 0) {
    strengthLabel = 'Empty';
    strengthClass = '';
  } else if (criteriaMet === 1) {
    strengthLabel = 'Weak';
    strengthClass = 'active-weak';
  } else if (criteriaMet === 2) {
    strengthLabel = 'Fair';
    strengthClass = 'active-fair';
  } else if (criteriaMet === 3) {
    strengthLabel = 'Good';
    strengthClass = 'active-good';
  } else if (criteriaMet === 4) {
    strengthLabel = 'Strong (Enterprise Compliant)';
    strengthClass = 'active-strong';
  }

  return (
    <div className="form-group">
      <TextInput
        label={label}
        type={showPassword ? 'text' : 'password'}
        value={value}
        trailingIcon={
          <button
            type="button"
            className="input-action-btn"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
        {...rest}
      />

      {showStrengthMeter && passwordStr.length > 0 && (
        <div className="password-meter-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Password Strength:</span>
            <span
              style={{
                fontWeight: 600,
                color:
                  criteriaMet >= 4
                    ? 'var(--status-success-text)'
                    : criteriaMet >= 3
                    ? 'var(--brand-primary)'
                    : criteriaMet >= 2
                    ? 'var(--status-warning-text)'
                    : 'var(--status-critical-text)'
              }}
            >
              {strengthLabel}
            </span>
          </div>

          <div className="password-meter-bars">
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                className={`password-meter-segment ${
                  criteriaMet >= seg ? strengthClass : ''
                }`}
              />
            ))}
          </div>

          <div className="password-criteria-list">
            <div className={`password-criterion ${hasMinLength ? 'met' : ''}`}>
              {hasMinLength ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
              10+ characters
            </div>
            <div className={`password-criterion ${hasUppercase ? 'met' : ''}`}>
              {hasUppercase ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
              Uppercase letter
            </div>
            <div className={`password-criterion ${hasNumber ? 'met' : ''}`}>
              {hasNumber ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
              Numeric digit
            </div>
            <div className={`password-criterion ${hasSpecial ? 'met' : ''}`}>
              {hasSpecial ? <Check size={12} /> : <span style={{ width: 12 }}>•</span>}
              Symbol (!@#$%)
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Toggle Switch
   ========================================================================== */
export interface ToggleSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
  variant?: 'primary' | 'danger';
  badge?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  id,
  checked,
  onChange,
  title,
  description,
  disabled,
  variant = 'primary',
  badge
}) => {
  return (
    <div
      id={id}
      className={`switch-control ${checked ? 'checked' : ''} ${variant === 'danger' ? 'danger' : ''}`}
      style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }
      }}
    >
      <div className="switch-track">
        <div className="switch-thumb" />
      </div>
      <div className="switch-label-group">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="switch-title">{title}</span>
          {badge && <span className="nav-badge nav-badge-neutral">{badge}</span>}
        </div>
        {description && <span className="switch-desc">{description}</span>}
      </div>
    </div>
  );
};

/* ==========================================================================
   Range Slider
   ========================================================================== */
export interface RangeSliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  helperText?: string;
}

export const RangeSlider: React.FC<RangeSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  helperText
}) => {
  return (
    <div className="form-group">
      {label && (
        <div className="form-label-row">
          <label className="form-label">{label}</label>
          <span className="range-slider-value">
            {value} {unit}
          </span>
        </div>
      )}
      <div className="range-slider-wrapper">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="range-slider"
        />
      </div>
      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   Tag Input Component
   ========================================================================== */
export interface TagInputProps {
  label?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  helperText?: string;
  maxTags?: number;
}

export const TagInput: React.FC<TagInputProps> = ({
  label,
  tags,
  onChange,
  placeholder = 'Add tag and press Enter...',
  helperText,
  maxTags = 10
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/^,|,$/g, '');
      if (trimmed && !tags.includes(trimmed) && tags.length < maxTags) {
        onChange([...tags, trimmed]);
        setInputValue('');
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="form-group">
      {label && (
        <div className="form-label-row">
          <label className="form-label">{label}</label>
          <span className="form-char-count">
            {tags.length}/{maxTags} tags
          </span>
        </div>
      )}

      <div className="tag-input-container">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip tag-primary">
            {tag}
            <button
              type="button"
              className="tag-remove-btn"
              onClick={() => removeTag(tag)}
              title={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {tags.length < maxTags && (
          <input
            type="text"
            className="tag-input-field"
            value={inputValue}
            placeholder={tags.length === 0 ? placeholder : ''}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>
      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   File Dropzone Component
   ========================================================================== */
export interface UploadedFileItem {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

export interface DropzoneProps {
  label?: string;
  files: UploadedFileItem[];
  onUpload: (newFile: UploadedFileItem) => void;
  onRemove: (id: string) => void;
  helperText?: string;
  acceptedTypes?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  label,
  files,
  onUpload,
  onRemove,
  helperText,
  acceptedTypes = '.csv, .json, .pem, .crt, .png, .jpg'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const newFile: UploadedFileItem = {
        id: `file-${Date.now()}-${i}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        progress: 100,
        status: 'completed'
      };
      onUpload(newFile);
    }
  };

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}

      <div
        className={`dropzone-container ${isDragOver ? 'is-dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFileSelection(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          multiple
          onChange={(e) => handleFileSelection(e.target.files)}
        />
        <div className="dropzone-icon-circle">
          <UploadCloud size={24} />
        </div>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Click to upload
          </span>{' '}
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>or drag and drop</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Supported files: {acceptedTypes} (Max 25MB)
        </span>
      </div>

      {files.length > 0 && (
        <div className="uploaded-files-list">
          {files.map((file) => (
            <div key={file.id} className="uploaded-file-item">
              <div className="uploaded-file-info">
                <FileText size={16} color="var(--brand-primary)" />
                <span className="uploaded-file-name">{file.name}</span>
                <span className="uploaded-file-size">{file.size}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={15} color="var(--status-success)" />
                <button
                  type="button"
                  className="input-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(file.id);
                  }}
                  title="Remove file"
                >
                  <Trash2 size={14} color="var(--status-critical-text)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {helperText && <span className="form-helper-text">{helperText}</span>}
    </div>
  );
};

/* ==========================================================================
   Form Actions Bar (Sticky Footer / Toolbar)
   ========================================================================== */
export interface FormActionBarProps {
  isDirty: boolean;
  isSubmitting?: boolean;
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  lastSavedText?: string;
  canSave?: boolean;
}

export const FormActionBar: React.FC<FormActionBarProps> = ({
  isDirty,
  isSubmitting = false,
  onSave,
  onReset,
  saveLabel = 'Save Changes',
  lastSavedText = 'All changes saved',
  canSave = true
}) => {
  return (
    <div className="form-actions-bar">
      <div className="form-actions-left">
        {isDirty ? (
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
            Unsaved changes detected
          </span>
        ) : (
          <span className="clean-state-pill">
            <CheckCircle2 size={13} color="var(--status-success)" />
            {lastSavedText}
          </span>
        )}
      </div>

      <div className="form-actions-right">
        {onReset && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onReset}
            disabled={!isDirty || isSubmitting}
          >
            <RotateCcw size={13} /> Discard
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!canSave || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Saving...
            </>
          ) : (
            <>
              <Save size={13} /> {saveLabel}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
