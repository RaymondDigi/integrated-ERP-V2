import React, { useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Zap,
  Send,
  Download,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { RequisitionLine } from '../../types';
import { CONTRACT_TYPES } from '../../data/hrMockData';

export const RightSideActionDrawer: React.FC = () => {
  const {
    activeDrawerItem,
    closeRightDrawer,
    approveRequisition,
    updateCandidateStage,
    toggleOnboardingItem,
    approveLeaveRequest,
    rejectLeaveRequest,
    convertContractType,
    closeOshPermit,
    signoffClearanceDept,
    addToast
  } = useApp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRightDrawer();
      }
    };
    if (activeDrawerItem) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDrawerItem, closeRightDrawer]);

  if (!activeDrawerItem) return null;

  const { type, data } = activeDrawerItem;

  const renderContent = () => {
    switch (type) {
      case 'requisition':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>REQUISITION #{data.requisitionNo}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.title}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.department} • {data.branch}</div>
              </div>
              <span className={`digicraft-status-pill ${data.status === 'APPROVED' ? 'success' : 'warning'}`}>
                {data.status.replace('_', ' ')}
              </span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Requested Headcount</span>
                  <strong style={{ fontSize: 14, color: 'var(--brand-primary)' }}>+{data.headcountRequired} Positions</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Monthly Budget</span>
                  <strong style={{ fontSize: 14 }}>KES {data.estimatedBudgetKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Compensation Grade</span>
                  <strong>{data.gradeScale}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Establishment Quota</span>
                  <strong>{data.currentHeadcount} of {data.maxHeadcountBudget} Filled</strong>
                </div>
              </div>
            </div>

            {data.lines && data.lines.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Position Lines ({data.lines.length})
                </label>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
                  {data.lines.map((line: RequisitionLine, idx: number) => (
                    <div key={line.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 12px',
                        fontSize: 12
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {idx + 1}. {line.title} <span style={{ color: 'var(--brand-primary)' }}>×{line.headcount}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {line.gradeScale}
                          {line.neededBy ? ` · by ${line.neededBy}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                          KES {(line.headcount * line.monthlySalaryKes).toLocaleString()}
                        </strong>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>per month</div>
                      </div>
                    </div>
                    {line.jobDescription && (
                      <details className="jd-drawer-details">
                        <summary>View job description</summary>
                        <dl className="jd-drawer-dl">
                          {line.jobDescription.reportsTo && (<><dt>Reports to</dt><dd>{line.jobDescription.reportsTo}</dd></>)}
                          {line.jobDescription.workLocation && (<><dt>Location</dt><dd>{line.jobDescription.workLocation}</dd></>)}
                          <dt>Vacancy reason</dt>
                          <dd>
                            {line.jobDescription.vacancyReason}
                            {line.jobDescription.replacingEmployee ? ` (${line.jobDescription.replacingEmployee})` : ''}
                          </dd>
                          {line.jobDescription.workingHours && (<><dt>Hours</dt><dd>{line.jobDescription.workingHours}</dd></>)}
                          {line.jobDescription.educationLevel && (<><dt>Education</dt><dd>{line.jobDescription.educationLevel}</dd></>)}
                          <dt>Experience</dt><dd>{line.jobDescription.minExperienceYears}+ years</dd>
                          {line.jobDescription.certifications && (<><dt>Certifications</dt><dd>{line.jobDescription.certifications}</dd></>)}
                          <dt>Travel</dt><dd>{line.jobDescription.travelRequired ? 'Required' : 'Not required'}</dd>
                        </dl>
                        {line.jobDescription.jobPurpose && (
                          <div className="jd-drawer-block">
                            <span>Job purpose</span>
                            <p>{line.jobDescription.jobPurpose}</p>
                          </div>
                        )}
                        {line.jobDescription.responsibilities.length > 0 && (
                          <div className="jd-drawer-block">
                            <span>Key responsibilities</span>
                            <ol>
                              {line.jobDescription.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                            </ol>
                          </div>
                        )}
                        {line.jobDescription.skills.length > 0 && (
                          <div className="jd-drawer-block">
                            <span>Skills</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {line.jobDescription.skills.map((s) => (
                                <span key={s} className="badge badge-info">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </details>
                    )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                Operational Justification
              </label>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                {data.justification}
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                Requester & Audit Chain
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Requested by <strong>{data.requester}</strong> on {data.requestedDate}.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              {data.status === 'PENDING_APPROVAL' ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      approveRequisition(data.id);
                      closeRightDrawer();
                    }}
                  >
                    <CheckCircle2 size={14} /> Approve & Authorize
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      addToast({ type: 'info', title: 'Requisition Held', message: 'Requisition returned to HOD.' });
                      closeRightDrawer();
                    }}
                  >
                    Hold for Review
                  </button>
                </>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', color: '#059669', fontWeight: 600, fontSize: 13 }}>
                  ✓ Headcount Authorized by Finance Director
                </div>
              )}
            </div>
          </div>
        );

      case 'payroll':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>PAYROLL BATCH #{data.batchNo}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.pipeline}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.period} • {data.branch}</div>
              </div>
              <span className="digicraft-status-pill success">{data.status.replace('_', ' ')}</span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Gross Payroll</span>
                  <strong style={{ fontSize: 15 }}>KES {data.totalGrossKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Net Disbursement</span>
                  <strong style={{ fontSize: 15, color: '#059669' }}>KES {data.totalNetDisbursementKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>KRA PAYE Remittance</span>
                  <strong style={{ color: '#dc2626' }}>KES {data.totalPayeKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Worker Count</span>
                  <strong>{data.workerCount} Personnel</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Statutory Breakdown (2026 Baseline)
              </h4>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 10, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>NSSF (Tier I & II):</span>
                  <strong>KES {data.totalNssfKes?.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>SHIF (2.75% of Gross):</span>
                  <strong>KES {data.totalShifKes?.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Affordable Housing Levy (1.5% EE + 1.5% ER):</span>
                  <strong>KES {data.totalAhlKes?.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              {data.pipeline === 'Weekly Payroll' && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    addToast({
                      type: 'success',
                      title: 'M-Pesa B2C Gateway Dispatched',
                      message: `Weekly payroll (M-Pesa B2C): instant mobile disbursement triggered for ${data.workerCount} employees.`
                    });
                    closeRightDrawer();
                  }}
                >
                  <Send size={14} /> Weekly payroll (M-Pesa B2C): Disburse Instant Payout
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  addToast({
                    type: 'success',
                    title: 'KRA Unified Return Exported',
                    message: 'iTax format return downloaded successfully.'
                  });
                  closeRightDrawer();
                }}
              >
                <Download size={14} /> Export KRA iTax Unified Return CSV
              </button>
            </div>
          </div>
        );

      case 'contract-threshold':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>SERVICE THRESHOLD • {data.staffId}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.fullName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.branch} • {data.block}</div>
              </div>
              <span className={`digicraft-status-pill ${data.contractConverted ? 'success' : 'critical'}`}>
                {data.contractConverted ? 'CONVERTED' : data.policyAction}
              </span>
            </div>

            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9f1239' }}>Service Threshold</div>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#be123c', lineHeight: 1.4 }}>
                Employee has worked <strong>{data.continuousDaysWorked} days</strong> within the rolling {data.rollingWindowDays}-day window (threshold set by contract type: {data.thresholdDays} days).
              </p>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 12, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Muster Progress:</span>
                <strong>{data.continuousDaysWorked} of {data.thresholdDays} Days ({Math.round((data.continuousDaysWorked / data.thresholdDays) * 100)}%)</strong>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (data.continuousDaysWorked / data.thresholdDays) * 100)}%`, height: '100%', background: '#dc2626' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              {!data.contractConverted ? (
                <button
                  className="btn btn-primary"
                  style={{ background: '#dc2626' }}
                  onClick={() => {
                    convertContractType(data.id);
                    closeRightDrawer();
                  }}
                >
                  <Zap size={14} /> Change contract type
                </button>
              ) : (
                <div style={{ color: '#059669', fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  ✓ Contract type changed — employee moved to a new contract type.
                </div>
              )}
            </div>
          </div>
        );

      case 'leave':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>LEAVE REQUEST #{data.id}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.staffName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.staffId} • {data.leaveType}</div>
              </div>
              <span className={`digicraft-status-pill ${data.status === 'APPROVED' ? 'success' : 'warning'}`}>
                {data.status.replace('_', ' ')}
              </span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Duration</span>
                  <strong style={{ fontSize: 14, color: 'var(--brand-primary)' }}>{data.daysCount} Working Days</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Dates</span>
                  <strong>{data.startDate} to {data.endDate}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                Reason & Handover
              </label>
              <div style={{ fontSize: 13, background: 'var(--bg-surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                {data.reason}
              </div>
            </div>

            {data.leaveAllowanceTriggered && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 10, borderRadius: 6, fontSize: 12, color: '#065f46', marginBottom: 16 }}>
                <strong>Statutory Leave Allowance Linked:</strong> Automatic annual leave allowance is scheduled in upcoming payroll run.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              {data.status === 'PENDING_APPROVAL' ? (
                <>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      approveLeaveRequest(data.id);
                      closeRightDrawer();
                    }}
                  >
                    <CheckCircle2 size={14} /> Approve Leave
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      rejectLeaveRequest(data.id);
                      closeRightDrawer();
                    }}
                  >
                    Decline
                  </button>
                </>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', color: '#059669', fontWeight: 600, fontSize: 13 }}>
                  ✓ Leave Request Approved & Logged on Muster
                </div>
              )}
            </div>
          </div>
        );

      case 'applicant':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>APPLICANT #{data.id}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.candidateName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.appliedRole}</div>
              </div>
              <span className="digicraft-status-pill primary">{data.stage}</span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Rubric Score</span>
                  <strong style={{ fontSize: 15, color: '#059669' }}>{data.scorecardScore}/100</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Experience</span>
                  <strong>{data.experienceYears} Years</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Email</span>
                  <span>{data.email}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Phone</span>
                  <span>{data.phone}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  updateCandidateStage(data.id, 'Offer Issued');
                  closeRightDrawer();
                }}
              >
                <CheckCircle2 size={14} /> Extend Formal Offer
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  updateCandidateStage(data.id, 'Panel Interview');
                  closeRightDrawer();
                }}
              >
                Schedule Interview
              </button>
            </div>
          </div>
        );

      case 'permit':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>PERMIT #{data.permitNo}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.permitType}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.location}</div>
              </div>
              <span className={`digicraft-status-pill ${data.status === 'ACTIVE' ? 'warning' : 'success'}`}>
                {data.status}
              </span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Permit Holder</span>
                <strong>{data.issuedTo}</strong>
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Authorized By</span>
                <strong>{data.authorizedBy}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Valid Until</span>
                <strong>{data.expiryTime}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              {data.status === 'ACTIVE' ? (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    closeOshPermit(data.id);
                    closeRightDrawer();
                  }}
                >
                  <CheckCircle2 size={14} /> Close Out Safety Permit
                </button>
              ) : (
                <div style={{ width: '100%', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                  ✓ Site cleared and permit closed.
                </div>
              )}
            </div>
          </div>
        );

      case 'separation':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>CLEARANCE #{data.staffId}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.staffName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.department} • {data.separationType}</div>
              </div>
              <span className="digicraft-status-pill info">{data.separationType}</span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Statutory Gratuity</span>
                  <strong style={{ fontSize: 14, color: '#059669' }}>KES {data.gratuityAmountKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Leave Encashment</span>
                  <strong style={{ fontSize: 14 }}>KES {data.leaveEncashmentKes?.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                Departmental Clearance Sign-offs
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, justifyContent: 'space-between' }}
                  onClick={() => signoffClearanceDept(data.id, 'stores')}
                >
                  <span>Stores / Tools:</span>
                  <span>{data.clearanceStatus?.stores ? '✓ Signed' : 'Pending ✕'}</span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, justifyContent: 'space-between' }}
                  onClick={() => signoffClearanceDept(data.id, 'it')}
                >
                  <span>IT Access:</span>
                  <span>{data.clearanceStatus?.it ? '✓ Signed' : 'Pending ✕'}</span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, justifyContent: 'space-between' }}
                  onClick={() => signoffClearanceDept(data.id, 'finance')}
                >
                  <span>Finance & Loans:</span>
                  <span>{data.clearanceStatus?.finance ? '✓ Signed' : 'Pending ✕'}</span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, justifyContent: 'space-between' }}
                  onClick={() => signoffClearanceDept(data.id, 'hr')}
                >
                  <span>HR Director:</span>
                  <span>{data.clearanceStatus?.hr ? '✓ Signed' : 'Pending ✕'}</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  addToast({
                    type: 'success',
                    title: 'P9 Certificate Issued',
                    message: `Terminal tax voucher generated for ${data.staffName}.`
                  });
                  closeRightDrawer();
                }}
              >
                <Download size={14} /> Issue Final KRA P9 Certificate
              </button>
            </div>
          </div>
        );

      case 'employee':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>STAFF #{data.staffId}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.fullName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.jobTitle} • {data.department}</div>
              </div>
              <span className="digicraft-status-pill success">{data.status || 'ACTIVE'}</span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Contract Type</span>
                  <strong style={{ fontSize: 13, color: 'var(--brand-primary)' }}>{data.contractType}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Basic Salary</span>
                  <strong style={{ fontSize: 13 }}>KES {data.basicSalaryKes?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Branch & Division</span>
                  <strong>{data.branch} {data.block ? `(${data.block})` : ''}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Remittance Channel</span>
                  <strong>{CONTRACT_TYPES.find((c) => c.name === data.contractType)?.payFrequency === 'WEEKLY' ? `M-Pesa (${data.mpesaPhoneMasked})` : `Bank (${data.bankAccountMasked})`}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Statutory KYC Identification (AES-256 Masked)
              </h4>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 12, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>National ID Card:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.nationalIdMasked}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>KRA PIN (iTax Verified):</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.kraPinMasked}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>NSSF Number:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.nssfNoMasked}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>SHIF Member ID:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{data.shifNoMasked}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  addToast({
                    type: 'info',
                    title: 'Dossier Exported',
                    message: `Personnel record exported for ${data.fullName}.`
                  });
                  closeRightDrawer();
                }}
              >
                <Download size={14} /> Export Dossier
              </button>
            </div>
          </div>
        );

      case 'onboarding':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>INDUCTION #{data.id}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.staffName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.jobTitle} • {data.department}</div>
              </div>
              <span className={`digicraft-status-pill ${data.progressPercent === 100 ? 'success' : 'warning'}`}>
                {data.progressPercent}% Completed
              </span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Operating Branch</span>
                  <strong>{data.branch}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Probation Closes</span>
                  <strong>{data.probationEndDate}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Statutory KYC & Induction Checklist
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => toggleOnboardingItem(data.id, 'kraPinVerified')}
                >
                  <span>1. KRA PIN Verification</span>
                  <span style={{ color: data.kraPinVerified ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {data.kraPinVerified ? '✓ Verified' : 'Pending ✕'}
                  </span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => toggleOnboardingItem(data.id, 'nssfVerified')}
                >
                  <span>2. NSSF Tier I/II Registration</span>
                  <span style={{ color: data.nssfVerified ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {data.nssfVerified ? '✓ Verified' : 'Pending ✕'}
                  </span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => toggleOnboardingItem(data.id, 'shifVerified')}
                >
                  <span>3. SHIF 2.75% Deductible Enrollment</span>
                  <span style={{ color: data.shifVerified ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {data.shifVerified ? '✓ Verified' : 'Pending ✕'}
                  </span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => toggleOnboardingItem(data.id, 'kitIssued')}
                >
                  <span>4. Safety Boot & PPE Issue</span>
                  <span style={{ color: data.kitIssued ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {data.kitIssued ? '✓ Issued' : 'Pending ✕'}
                  </span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', fontSize: 12 }}
                  onClick={() => toggleOnboardingItem(data.id, 'contractSigned')}
                >
                  <span>5. Signed Employment Contract</span>
                  <span style={{ color: data.contractSigned ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {data.contractSigned ? '✓ Signed' : 'Pending ✕'}
                  </span>
                </button>
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  addToast({
                    type: 'success',
                    title: 'Induction Milestone Confirmed',
                    message: `Onboarding progress saved for ${data.staffName}.`
                  });
                  closeRightDrawer();
                }}
              >
                Save & Close Drawer
              </button>
            </div>
          </div>
        );

      case 'attendance':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <span className="digicraft-badge-light" style={{ fontSize: 10 }}>PUNCH #{data.id}</span>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 2px 0' }}>{data.staffName}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.staffId} • {data.branch}</div>
              </div>
              <span className="digicraft-status-pill success">{data.type}</span>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 14, marginBottom: 16, border: '1px solid var(--border-subtle)', fontSize: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Punch Source</span>
                  <strong>{data.source}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Timestamp</span>
                  <strong>{data.timestamp}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Assigned Section</span>
                  <strong>{data.block || 'Main Site'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: 11 }}>Device / Terminal</span>
                  <strong style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{data.deviceId}</strong>
                </div>
              </div>
            </div>

            {data.pieceRateUnits && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600 }}>Output Logged</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                  {data.pieceRateUnits} Units Produced
                </div>
                <div style={{ fontSize: 11, color: '#065f46', marginTop: 4 }}>
                  Calculated Earnings @ KES 14.50/unit: <strong>KES {(data.pieceRateUnits * 14.5).toFixed(2)}</strong>
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={closeRightDrawer}
              >
                Close Drawer
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{type} Details</h3>
            <pre style={{ fontSize: 11, overflowX: 'auto', background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 6 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 999,
          animation: 'fadeIn 0.15s ease-out'
        }}
        onClick={closeRightDrawer}
      />

      {/* Drawer Container (AWS / Atlassian Pattern) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: '92vw',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-drawer)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Drawer Header Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Action & Inspection Drawer
            </span>
          </div>
          <button
            onClick={closeRightDrawer}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 4,
              borderRadius: 4
            }}
            title="Close drawer (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {renderContent()}
        </div>
      </div>
    </>
  );
};
