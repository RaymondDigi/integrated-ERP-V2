import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ArrowRight,
  ShieldAlert,
  Users,
  Building,
  KeyRound,
  FileSpreadsheet,
  Cpu,
  CornerDownLeft,
  RefreshCw,
  Sun,
  Moon,
  User,
  Sliders
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useFinance, type FinancePage } from '../../suites/finance/store';
import { useCommercial } from '../../suites/commercial/store';
import { useOperations } from '../../suites/operations/store';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Users' | 'Organizations' | 'Alerts';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number }>;
  onSelect: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setCurrentView,
    setSelectedUser,
    users,
    organizations,
    workItems,
    executeWorkItemAction,
    toggleTheme,
    theme
  } = useApp();
  const finance = useFinance();
  const commercial = useCommercial();
  const openSuite = (view: 'trading' | 'procurement' | 'bizdev', go: () => void) => {
    setCurrentView(view);
    go();
    setIsCommandPaletteOpen(false);
  };
  const ops = useOperations();
  const openOps = (view: 'warehousing' | 'production' | 'shipping' | 'fleet' | 'maintenance', go: () => void) => {
    setCurrentView(view);
    go();
    setIsCommandPaletteOpen(false);
  };
  const openFinance = (page: FinancePage, focus: string | null = null) => {
    setCurrentView('finance');
    finance.setPage(page, focus);
    setIsCommandPaletteOpen(false);
  };

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const allCommands: CommandItem[] = [
    // Quick Actions
    {
      id: 'act_okta',
      category: 'Actions',
      title: 'Investigate & Rotate Okta SCIM Connector',
      subtitle: 'WI-8942 · 14 failed sync batches',
      icon: RefreshCw,
      onSelect: () => {
        executeWorkItemAction('WI-8942');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'act_mfa',
      category: 'Actions',
      title: 'Force Immediate MFA Enrollment on Super Admins',
      subtitle: 'WI-8941 · 3 accounts without MFA',
      icon: KeyRound,
      onSelect: () => {
        executeWorkItemAction('WI-8941');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'act_replay_wf',
      category: 'Actions',
      title: 'Replay Failed Billing Reconciliation Workflows',
      subtitle: 'WI-8940 · 17 failed steps',
      icon: RefreshCw,
      onSelect: () => {
        executeWorkItemAction('WI-8940');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'act_theme',
      category: 'Actions',
      title: `Toggle Theme (Currently ${theme})`,
      subtitle: 'Switch between dark and light operational console',
      icon: theme === 'dark' ? Sun : Moon,
      onSelect: () => {
        toggleTheme();
        setIsCommandPaletteOpen(false);
      }
    },

    // Navigation
    {
      id: 'nav_apps',
      category: 'Navigation',
      title: 'Go to Apps Launcher (DigiCraft Switchboard)',
      subtitle: 'Main enterprise launchpad with 12 sequential HR processes',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('apps');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_org_setup',
      category: 'Navigation',
      title: 'Go to Company Setup',
      subtitle: 'Create or edit companies: names, PINs, logos, periods, overtime, probation, retirement, rounding',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('org-setup');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_ess',
      category: 'Navigation',
      title: 'Go to My Employee Portal (ESS)',
      subtitle: 'Self-service: leave, payslips, attendance, requests, documents & profile',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('ess');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_fin',
      category: 'Navigation',
      title: 'Go to Finance overview',
      subtitle: 'Cash, receivables, payables, profit and what needs your attention',
      icon: ArrowRight,
      onSelect: () => openFinance('overview')
    },
    {
      id: 'nav_fin_inv',
      category: 'Navigation',
      title: 'Finance: Sales invoices',
      subtitle: 'Bill customers and follow up what is owed',
      icon: ArrowRight,
      onSelect: () => openFinance('invoices')
    },
    {
      id: 'nav_fin_newinv',
      category: 'Navigation',
      title: 'Finance: New sales invoice',
      subtitle: 'Create an invoice and send it for approval',
      icon: ArrowRight,
      onSelect: () => openFinance('invoices', 'new')
    },
    {
      id: 'nav_fin_bills',
      category: 'Navigation',
      title: 'Finance: Supplier bills',
      subtitle: 'Capture supplier invoices with three-way matching',
      icon: ArrowRight,
      onSelect: () => openFinance('bills')
    },
    {
      id: 'nav_fin_pay',
      category: 'Navigation',
      title: 'Finance: Supplier payments',
      subtitle: 'Prepare and approve payments to suppliers',
      icon: ArrowRight,
      onSelect: () => openFinance('payments')
    },
    {
      id: 'nav_fin_jv',
      category: 'Navigation',
      title: 'Finance: Journals',
      subtitle: 'Manual journals, reversals and system postings',
      icon: ArrowRight,
      onSelect: () => openFinance('journals')
    },
    {
      id: 'nav_fin_bank',
      category: 'Navigation',
      title: 'Finance: Bank reconciliation',
      subtitle: 'Match the bank statement to the ledger',
      icon: ArrowRight,
      onSelect: () => openFinance('bank')
    },
    {
      id: 'nav_fin_close',
      category: 'Navigation',
      title: 'Finance: Month-end close',
      subtitle: 'Checklist and period locking',
      icon: ArrowRight,
      onSelect: () => openFinance('close')
    },
    {
      id: 'nav_fin_rep',
      category: 'Navigation',
      title: 'Finance: Reports',
      subtitle: 'Profit and loss, balance sheet, trial balance, ageing, VAT',
      icon: ArrowRight,
      onSelect: () => openFinance('reports')
    },
    {
      id: 'nav_trd',
      category: 'Navigation',
      title: 'Go to Trading & Sales',
      subtitle: 'Quotations, sales orders, deliveries and price list',
      icon: ArrowRight,
      onSelect: () => openSuite('trading', () => commercial.setTrading('overview'))
    },
    {
      id: 'nav_trd_q',
      category: 'Navigation',
      title: 'Trading: New quotation',
      subtitle: 'Price up a customer request',
      icon: ArrowRight,
      onSelect: () => openSuite('trading', () => commercial.setTrading('quotations', 'new'))
    },
    {
      id: 'nav_trd_o',
      category: 'Navigation',
      title: 'Trading: Sales orders',
      subtitle: 'Approve, dispatch and invoice orders',
      icon: ArrowRight,
      onSelect: () => openSuite('trading', () => commercial.setTrading('orders'))
    },
    {
      id: 'nav_prc',
      category: 'Navigation',
      title: 'Go to Procurement',
      subtitle: 'Requisitions, purchase orders, goods received and suppliers',
      icon: ArrowRight,
      onSelect: () => openSuite('procurement', () => commercial.setProcurement('overview'))
    },
    {
      id: 'nav_prc_r',
      category: 'Navigation',
      title: 'Procurement: New requisition',
      subtitle: 'Ask purchasing to buy something',
      icon: ArrowRight,
      onSelect: () => openSuite('procurement', () => commercial.setProcurement('requisitions', 'new'))
    },
    {
      id: 'nav_prc_s',
      category: 'Navigation',
      title: 'Procurement: Stock & reorder',
      subtitle: 'Materials below their reorder level',
      icon: ArrowRight,
      onSelect: () => openSuite('procurement', () => commercial.setProcurement('stock'))
    },
    {
      id: 'nav_bd',
      category: 'Navigation',
      title: 'Go to Business Development',
      subtitle: 'Pipeline, opportunities and forecast',
      icon: ArrowRight,
      onSelect: () => openSuite('bizdev', () => commercial.setBizdev('overview'))
    },
    {
      id: 'nav_bd_p',
      category: 'Navigation',
      title: 'Business Development: Pipeline board',
      subtitle: 'Drag deals through the stages',
      icon: ArrowRight,
      onSelect: () => openSuite('bizdev', () => commercial.setBizdev('pipeline'))
    },
    {
      id: 'nav_wh',
      category: 'Navigation',
      title: 'Go to Warehousing',
      subtitle: 'Stock by location, transfers and counts',
      icon: ArrowRight,
      onSelect: () => openOps('warehousing', () => ops.setWarehousing('overview'))
    },
    {
      id: 'nav_wh_c',
      category: 'Navigation',
      title: 'Warehousing: Start a stock count',
      subtitle: 'Blind count with approved adjustments',
      icon: ArrowRight,
      onSelect: () => openOps('warehousing', () => ops.setWarehousing('counts', 'new'))
    },
    {
      id: 'nav_pr',
      category: 'Navigation',
      title: 'Go to Blending & Production',
      subtitle: 'Batches, recipes and quality',
      icon: ArrowRight,
      onSelect: () => openOps('production', () => ops.setProduction('overview'))
    },
    {
      id: 'nav_pr_b',
      category: 'Navigation',
      title: 'Production: Plan a batch',
      subtitle: 'Check materials and schedule a run',
      icon: ArrowRight,
      onSelect: () => openOps('production', () => ops.setProduction('batches', 'new'))
    },
    {
      id: 'nav_sh',
      category: 'Navigation',
      title: 'Go to Shipping & Exports',
      subtitle: 'Shipments and export documents',
      icon: ArrowRight,
      onSelect: () => openOps('shipping', () => ops.setShipping('overview'))
    },
    {
      id: 'nav_fl',
      category: 'Navigation',
      title: 'Go to Transport & Fleet',
      subtitle: 'Vehicles, trips and fuel',
      icon: ArrowRight,
      onSelect: () => openOps('fleet', () => ops.setFleet('overview'))
    },
    {
      id: 'nav_mt',
      category: 'Navigation',
      title: 'Go to Maintenance & Projects',
      subtitle: 'Work orders, preventive plan and projects',
      icon: ArrowRight,
      onSelect: () => openOps('maintenance', () => ops.setMaintenance('overview'))
    },
    {
      id: 'nav_mt_w',
      category: 'Navigation',
      title: 'Maintenance: Report a fault',
      subtitle: 'Raise a work order',
      icon: ArrowRight,
      onSelect: () => openOps('maintenance', () => ops.setMaintenance('workorders', 'new'))
    },
    {
      id: 'nav_req',
      category: 'Navigation',
      title: 'Go to Employee Requisition (#01)',
      subtitle: 'Establishment headcount control & vacancy authorization',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('employee-requisition');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_rec',
      category: 'Navigation',
      title: 'Go to Recruitment & Pipeline (#02)',
      subtitle: 'Candidate tracking, aptitude testing & scorecards',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('recruitment');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_onb',
      category: 'Navigation',
      title: 'Go to Pre-Employment & Induction (#03)',
      subtitle: 'KYC statutory verification & PPE kit allocation',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('onboarding');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_emp',
      category: 'Navigation',
      title: 'Go to Employee Master & PII Vault (#04)',
      subtitle: 'AES-256 encrypted registry & org chart links',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('employees');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_att',
      category: 'Navigation',
      title: 'Go to Biometric Attendance & Muster (#05)',
      subtitle: 'ADMS gate push, GPS geofence & output capture',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('attendance');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_leave',
      category: 'Navigation',
      title: 'Go to Leave & Absence Management (#06)',
      subtitle: 'Statutory balances & payroll leave allowance triggers',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('leave');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_payroll',
      category: 'Navigation',
      title: 'Go to Employee Payroll (#07)',
      subtitle: 'KRA 2026, NSSF, SHIF, Housing Levy, bank EFT & M-Pesa B2C',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('payroll');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_perf',
      category: 'Navigation',
      title: 'Go to Performance & OKRs (#08)',
      subtitle: 'Balanced scorecards, 9-box matrix & merit bonuses',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('performance');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_train',
      category: 'Navigation',
      title: 'Go to Learning & Skills Matrix (#09)',
      subtitle: 'Statutory medical exams & boiler certifications',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('training');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_sec37',
      category: 'Navigation',
      title: 'Go to Contract Compliance & Disciplinary (#10)',
      subtitle: 'Service threshold monitor & disciplinary hearing workflows',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('disciplinary');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_osh',
      category: 'Navigation',
      title: 'Go to OSH & Gate Security (#11)',
      subtitle: 'Permits to work, DOSHS Form 1 & NFC guard patrols',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('osh-security');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_sep',
      category: 'Navigation',
      title: 'Go to Separation & Gratuity (#12)',
      subtitle: 'Multi-department clearance, gratuity & terminal P9',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('separation');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_overview',
      category: 'Navigation',
      title: 'Go to Mission Control Overview',
      subtitle: 'Attention banner, pulse metrics, live activity',
      icon: ArrowRight,
      onSelect: () => {
        setCurrentView('overview');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_wq',
      category: 'Navigation',
      title: 'Open Work Queue',
      subtitle: 'Triage anomalies, approvals, and operational alerts',
      icon: ShieldAlert,
      onSelect: () => {
        setCurrentView('work-queue');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_users',
      category: 'Navigation',
      title: 'Open Users & Identity Management',
      subtitle: 'Inspect sessions, enforce MFA, manage roles',
      icon: Users,
      onSelect: () => {
        setCurrentView('users');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_audit',
      category: 'Navigation',
      title: 'Open Immutable Audit Logs',
      subtitle: 'Cryptographic tamper-evident activity with state diffs',
      icon: FileSpreadsheet,
      onSelect: () => {
        setCurrentView('audit');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_health',
      category: 'Navigation',
      title: 'Inspect System Health & Infrastructure',
      subtitle: 'Latency, error budgets, microservice mesh',
      icon: Cpu,
      onSelect: () => {
        setCurrentView('health');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_forms',
      category: 'Navigation',
      title: 'Open Forms & Input Showcase',
      subtitle: 'Comprehensive input types, validations, password meter, dropzone, and actions',
      icon: Sliders,
      onSelect: () => {
        setCurrentView('forms-inputs');
        setIsCommandPaletteOpen(false);
      }
    },
    {
      id: 'nav_profile',
      category: 'Navigation',
      title: 'Open My Profile & Account Settings',
      subtitle: 'Personal info, password rotation, 2FA hardware keys, and API tokens',
      icon: User,
      onSelect: () => {
        setCurrentView('profile');
        setIsCommandPaletteOpen(false);
      }
    },

    // Users
    ...users.map((u) => ({
      id: `user_${u.id}`,
      category: 'Users' as const,
      title: `${u.name} (${u.email})`,
      subtitle: `${u.role} · ${u.organizationName} · ${u.status}`,
      icon: Users,
      onSelect: () => {
        setCurrentView('users');
        setSelectedUser(u);
        setIsCommandPaletteOpen(false);
      }
    })),

    // Organizations
    ...organizations.map((org) => ({
      id: `org_${org.id}`,
      category: 'Organizations' as const,
      title: `${org.name}`,
      subtitle: `${org.tier} · ${org.usersCount.toLocaleString()} users · ${org.region}`,
      icon: Building,
      onSelect: () => {
        setCurrentView('organizations');
        setIsCommandPaletteOpen(false);
      }
    })),

    // Work Queue Alerts
    ...workItems.map((w) => ({
      id: `alert_${w.id}`,
      category: 'Alerts' as const,
      title: `[${w.severity}] ${w.title}`,
      subtitle: `${w.resource} · Status: ${w.status}`,
      icon: ShieldAlert,
      onSelect: () => {
        setCurrentView('work-queue');
        setIsCommandPaletteOpen(false);
      }
    }))
  ];

  const filteredCommands = allCommands.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q)) ||
      cmd.category.toLowerCase().includes(q)
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect();
      }
    }
  };

  return (
    <div className="emc-cmd-overlay" onClick={() => setIsCommandPaletteOpen(false)}>
      <div className="emc-cmd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="emc-cmd-input-wrap">
          <Search size={18} color="var(--text-secondary)" />
          <input
            ref={inputRef}
            type="text"
            className="emc-cmd-input"
            placeholder="Type a command, search users, organizations, or logs..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <span className="kbd-shortcut">ESC to close</span>
        </div>

        <div className="emc-cmd-results">
          {filteredCommands.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No commands or resources matching "{query}"
            </div>
          ) : (
            filteredCommands.slice(0, 15).map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`emc-cmd-item ${isSelected ? 'active' : ''}`}
                  onClick={cmd.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 26,
                      height: 26,
                      borderRadius: 4,
                      background: isSelected ? 'var(--brand-primary)' : 'var(--bg-surface-elevated)',
                      color: isSelected ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Icon size={14} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: isSelected ? 'var(--text-primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cmd.title}
                      </span>
                      {cmd.subtitle && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cmd.subtitle}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {cmd.category}
                    </span>
                    {isSelected && <CornerDownLeft size={12} color="var(--text-secondary)" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="emc-cmd-footer">
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↑↓</kbd> to navigate</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>↵</kbd> to select</span>
          <span><kbd style={{ fontFamily: 'var(--font-mono)' }}>esc</kbd> to dismiss</span>
        </div>
      </div>
    </div>
  );
};
