import React, { useState } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import type { JobDescription } from '../../types';

export const EDUCATION_LEVELS = [
  'KCSE Certificate',
  'Artisan / Trade Certificate',
  'Diploma',
  "Bachelor's Degree",
  "Master's Degree",
  'Doctorate'
];

const VACANCY_REASONS: JobDescription['vacancyReason'][] = [
  'New Position',
  'Replacement',
  'Expansion',
  'Seasonal Demand'
];

export const emptyJobDescription = (): JobDescription => ({
  reportsTo: '',
  workLocation: '',
  vacancyReason: 'New Position',
  replacingEmployee: '',
  jobPurpose: '',
  responsibilities: [''],
  educationLevel: '',
  minExperienceYears: 0,
  skills: [],
  certifications: '',
  workingHours: 'Mon–Fri, 8:00–17:00',
  travelRequired: false
});

/** Key fields used to show how complete a job description is. */
export const jobDescriptionProgress = (jd?: JobDescription) => {
  const checks = [
    !!jd?.jobPurpose.trim(),
    !!jd?.responsibilities.some((r) => r.trim()),
    !!jd?.educationLevel,
    !!jd && jd.skills.length > 0,
    !!jd?.reportsTo.trim(),
    !!jd?.workLocation.trim()
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
};

/** Strips blank responsibilities so saved records stay clean. */
export const cleanJobDescription = (jd?: JobDescription): JobDescription | undefined => {
  if (!jd) return undefined;
  return {
    ...jd,
    reportsTo: jd.reportsTo.trim(),
    workLocation: jd.workLocation.trim(),
    replacingEmployee: jd.vacancyReason === 'Replacement' ? jd.replacingEmployee.trim() : '',
    jobPurpose: jd.jobPurpose.trim(),
    responsibilities: jd.responsibilities.map((r) => r.trim()).filter(Boolean),
    certifications: jd.certifications.trim()
  };
};

interface JobDescriptionPanelProps {
  value?: JobDescription;
  positionTitle: string;
  onChange: (jd: JobDescription) => void;
}

export const JobDescriptionPanel: React.FC<JobDescriptionPanelProps> = ({ value, positionTitle, onChange }) => {
  const jd = value ?? emptyJobDescription();
  const [skillDraft, setSkillDraft] = useState('');

  const set = (patch: Partial<JobDescription>) => onChange({ ...jd, ...patch });

  const setResponsibility = (idx: number, text: string) =>
    set({ responsibilities: jd.responsibilities.map((r, i) => (i === idx ? text : r)) });
  const addResponsibility = () => set({ responsibilities: [...jd.responsibilities, ''] });
  const removeResponsibility = (idx: number) =>
    set({
      responsibilities:
        jd.responsibilities.length > 1 ? jd.responsibilities.filter((_, i) => i !== idx) : ['']
    });

  const addSkill = () => {
    const parts = skillDraft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !jd.skills.some((k) => k.toLowerCase() === s.toLowerCase()));
    if (parts.length) set({ skills: [...jd.skills, ...parts] });
    setSkillDraft('');
  };

  return (
    <div className="jd-panel">
      <div className="jd-panel-head">
        <strong>Job description</strong>
        <span>{positionTitle.trim() || 'Untitled position'}</span>
      </div>

      <div className="jd-grid">
        {/* Role context */}
        <label className="req-field">
          <span>Reports to</span>
          <input
            className="form-control"
            placeholder="e.g., Operations Manager"
            value={jd.reportsTo}
            onChange={(e) => set({ reportsTo: e.target.value })}
          />
        </label>
        <label className="req-field">
          <span>Work location / site</span>
          <input
            className="form-control"
            placeholder="e.g., Kericho Factory Unit 1"
            value={jd.workLocation}
            onChange={(e) => set({ workLocation: e.target.value })}
          />
        </label>
        <label className="req-field">
          <span>Reason for vacancy</span>
          <select
            className="form-control"
            value={jd.vacancyReason}
            onChange={(e) => set({ vacancyReason: e.target.value as JobDescription['vacancyReason'] })}
          >
            {VACANCY_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        {jd.vacancyReason === 'Replacement' ? (
          <label className="req-field">
            <span>Replacing employee</span>
            <input
              className="form-control"
              placeholder="Name or staff number"
              value={jd.replacingEmployee}
              onChange={(e) => set({ replacingEmployee: e.target.value })}
            />
          </label>
        ) : (
          <label className="req-field">
            <span>Working hours / shift</span>
            <input
              className="form-control"
              value={jd.workingHours}
              onChange={(e) => set({ workingHours: e.target.value })}
            />
          </label>
        )}

        {/* Purpose */}
        <label className="req-field jd-span-full">
          <span>Job purpose</span>
          <textarea
            className="form-control"
            rows={2}
            placeholder="One or two sentences on why this role exists and what it delivers."
            value={jd.jobPurpose}
            onChange={(e) => set({ jobPurpose: e.target.value })}
          />
        </label>

        {/* Responsibilities */}
        <div className="req-field jd-span-full">
          <span>Key responsibilities</span>
          <div className="jd-list">
            {jd.responsibilities.map((r, idx) => (
              <div className="jd-list-item" key={idx}>
                <GripVertical size={14} className="jd-list-grip" aria-hidden="true" />
                <span className="jd-list-no">{idx + 1}.</span>
                <input
                  className="form-control"
                  placeholder="e.g., Supervise daily team operations and report output"
                  value={r}
                  onChange={(e) => setResponsibility(idx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addResponsibility();
                    }
                  }}
                  autoFocus={idx > 0 && idx === jd.responsibilities.length - 1 && !r}
                />
                <button
                  type="button"
                  className="req-icon-btn danger"
                  onClick={() => removeResponsibility(idx)}
                  aria-label={`Remove responsibility ${idx + 1}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="jd-inline-add" onClick={addResponsibility}>
            <Plus size={13} /> Add responsibility
          </button>
        </div>

        {/* Requirements */}
        <label className="req-field">
          <span>Minimum education</span>
          <select
            className="form-control"
            value={jd.educationLevel}
            onChange={(e) => set({ educationLevel: e.target.value })}
          >
            <option value="">Select…</option>
            {EDUCATION_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Minimum experience (years)</span>
          <input
            className="form-control"
            type="number"
            min={0}
            max={40}
            value={jd.minExperienceYears}
            onChange={(e) => set({ minExperienceYears: Math.max(0, Number(e.target.value)) })}
          />
        </label>
        <label className="req-field jd-span-2">
          <span>Certifications / licences</span>
          <input
            className="form-control"
            placeholder="e.g., Valid driving licence (BCE), First Aid certificate"
            value={jd.certifications}
            onChange={(e) => set({ certifications: e.target.value })}
          />
        </label>

        <div className="req-field jd-span-full">
          <span>Required skills</span>
          <div className="tag-input-container jd-skills">
            {jd.skills.map((s) => (
              <span className="tag-chip tag-primary" key={s}>
                {s}
                <button
                  type="button"
                  className="tag-remove-btn"
                  onClick={() => set({ skills: jd.skills.filter((k) => k !== s) })}
                  aria-label={`Remove ${s}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              className="tag-input-field"
              placeholder={jd.skills.length ? 'Add another…' : 'Type a skill and press Enter (comma-separate several)'}
              value={skillDraft}
              onChange={(e) => setSkillDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addSkill();
                } else if (e.key === 'Backspace' && !skillDraft && jd.skills.length) {
                  set({ skills: jd.skills.slice(0, -1) });
                }
              }}
              onBlur={addSkill}
            />
          </div>
        </div>

        {jd.vacancyReason === 'Replacement' && (
          <label className="req-field">
            <span>Working hours / shift</span>
            <input
              className="form-control"
              value={jd.workingHours}
              onChange={(e) => set({ workingHours: e.target.value })}
            />
          </label>
        )}
        <label className="jd-check">
          <input
            type="checkbox"
            checked={jd.travelRequired}
            onChange={(e) => set({ travelRequired: e.target.checked })}
          />
          <span>Role requires travel between branches / sites</span>
        </label>
      </div>
    </div>
  );
};
