import {
  WorkItem,
  User,
  Organization,
  AuditEvent,
  SystemHealthItem,
  Integration,
  Workflow,
  AIInsight,
  RoleDefinition,
  Invoice
} from '../types';

export const INITIAL_WORK_ITEMS: WorkItem[] = [
  {
    id: 'WI-8942',
    severity: 'CRITICAL',
    category: 'Operations',
    title: 'Production integration failing: Okta SCIM Directory Sync',
    description: 'Okta SCIM synchronization worker has encountered 502 Bad Gateway errors for 14 consecutive sync batches. User provisioning is stalled.',
    resource: 'Okta SCIM Connector (prod-us-east-1)',
    resourceType: 'Integration',
    resourceId: 'INT-OKTA-01',
    detectedTime: '4 mins ago',
    owner: 'DevOps Primary (On-Call)',
    status: 'OPEN',
    recommendedAction: {
      label: 'Investigate Connection & Rotate Token',
      actionKey: 'investigate_okta',
      danger: true
    },
    details: {
      reason: 'Upstream gateway timeout on https://scim.okta.enterprise/v2/Users endpoint.',
      impact: '184 pending enterprise provisionings delayed; new employee onboarding blocked in Acme Corp.',
      evidence: [
        'HTTP 502 Bad Gateway from upstream edge proxy',
        'TLS handshake time exceeded 4,500ms baseline',
        'Last successful sync: 2026-09-08 16:12:00 UTC'
      ],
      auditTrail: [
        { time: '16:26:10 UTC', actor: 'System Monitor', action: 'Threshold Breached (14 failed batches)' },
        { time: '16:28:40 UTC', actor: 'PagerDuty', action: 'Incident #INC-4109 dispatched to DevOps On-Call' }
      ]
    }
  },
  {
    id: 'WI-8941',
    severity: 'CRITICAL',
    category: 'Security',
    title: '3 privileged users with Super Admin access without MFA',
    description: 'Quarterly compliance scan detected Super Admin accounts operating without hardware-backed or TOTP multi-factor authentication.',
    resource: 'IAM Policy: Root Privileges (Org: Citadel Dynamics)',
    resourceType: 'User',
    resourceId: 'USR-MFA-RISK',
    detectedTime: '12 mins ago',
    owner: 'Security Operations (SecOps)',
    status: 'OPEN',
    recommendedAction: {
      label: 'Force Immediate MFA Enrollment',
      actionKey: 'force_mfa',
      danger: true
    },
    details: {
      reason: 'Accounts were imported during staging migration without policy enforcement flag.',
      impact: 'SOC2 Type II Trust Principle CC6.1 violation risk; accounts have full infrastructure write privileges.',
      evidence: [
        'User: marcus.vance@citadel.com (Super Admin, last active 2m ago)',
        'User: helena.rostova@citadel.com (Super Admin, last active 45m ago)',
        'User: devops-emergency@citadel.com (Break-glass account, MFA exempt tag expired)'
      ],
      auditTrail: [
        { time: '16:18:22 UTC', actor: 'Compliance Automated Auditor', action: 'SOC2 Policy Rule SEC-04 flagged 3 exceptions' }
      ]
    }
  },
  {
    id: 'WI-8940',
    severity: 'WARNING',
    category: 'Operations',
    title: '17 workflows failed: Nightly Billing Reconciliation & Ingestion',
    description: 'Workflow execution batch failed during Step 3: Snowflake DB query timeout on transaction ledger tables.',
    resource: 'Batch Runner: WF-NIGHTLY-RECON-US',
    resourceType: 'Workflow',
    resourceId: 'WF-NIGHTLY-RECON',
    detectedTime: '28 mins ago',
    owner: 'Data Engineering Lead',
    status: 'OPEN',
    recommendedAction: {
      label: 'Replay Failed Steps with Adaptive Backoff',
      actionKey: 'replay_workflows'
    },
    details: {
      reason: 'Snowflake warehouse warehouse_etl_xlarge was auto-suspended during partition lock.',
      impact: 'Invoicing generation delayed by 1 cycle for 2,400 multi-tenant billing accounts.',
      evidence: [
        'Query ID: 01b4429c-0001-44fe-0000-00011867 timeout after 600s',
        '17 runner threads aborted with status TASK_TIMEOUT'
      ],
      auditTrail: [
        { time: '16:02:15 UTC', actor: 'Workflow Engine', action: 'Pipeline status changed to FAILED' }
      ]
    }
  },
  {
    id: 'WI-8939',
    severity: 'APPROVAL',
    category: 'Approvals',
    title: '4 access requests waiting: JIT Temporary Super-Admin elevation',
    description: 'Senior SRE engineers requesting 4-hour Just-In-Time root access for scheduled kernel patching on Production Kubernetes nodes.',
    resource: 'Access Policy: JIT-ELEVATION-PROD',
    resourceType: 'Access Request',
    resourceId: 'REQ-JIT-992',
    detectedTime: '35 mins ago',
    owner: 'Enterprise Admin (You)',
    status: 'OPEN',
    recommendedAction: {
      label: 'Review Access Justifications & Approve',
      actionKey: 'review_approvals'
    },
    details: {
      reason: 'Change Request CHG-8812 approved by CAB. Requires dual-custody authorization.',
      impact: 'Will grant temporary write access to us-east-1 production clusters with automatic revocation at 20:30 UTC.',
      evidence: [
        'Requester: David Chen (Staff SRE, employee #8841)',
        'Change Ticket: CHG-8812 (Kernel security patch CVE-2026-3829)',
        'Scope: kubernetes-prod-us-east-1.internal'
      ],
      auditTrail: [
        { time: '15:55:00 UTC', actor: 'David Chen', action: 'Requested elevation for 4 hours with justification ticket CHG-8812' }
      ]
    }
  },
  {
    id: 'WI-8938',
    severity: 'AI_INSIGHT',
    category: 'AI Recommendations',
    title: 'Unusual API traffic detected: +41% above 30-day baseline',
    description: 'API gateway observed sudden surge in read requests to `/v2/organizations/*/usage-meters`. Likely related to newly deployed Datadog metric scraper.',
    resource: 'API Gateway: Core Ingestion (api.missioncontrol.io)',
    resourceType: 'API Key',
    resourceId: 'API-SRV-DATADOG',
    detectedTime: '42 mins ago',
    owner: 'AI Operational Sentinel',
    status: 'OPEN',
    recommendedAction: {
      label: 'Apply Dynamic Rate-Limit Profile & Investigate',
      actionKey: 'apply_rate_limit'
    },
    details: {
      reason: 'Token `datadog-telemetry-agent-v4` polling interval dropped from 60s to 500ms.',
      impact: 'Increased DB cache eviction rate by 8.4%; P95 latency drifted from 22ms to 48ms.',
      evidence: [
        'Observed 84,200 req/min vs 59,700 req/min baseline (+41.03%)',
        'Originating IP: 54.236.192.42 (AWS us-east-1 Datadog collector)',
        'Confidence score: 89.4% (Identified identical pattern in deploy artifact #884)'
      ],
      auditTrail: [
        { time: '15:48:19 UTC', actor: 'AI Operational Sentinel', action: 'Anomaly classified with 89% confidence' }
      ]
    }
  },
  {
    id: 'WI-8937',
    severity: 'WARNING',
    category: 'Security',
    title: 'API key `prod-billing-worker-legacy` expiring in 48 hours',
    description: 'Enterprise payment webhook secret has not been rotated in 363 days. Key will be rejected by Stripe and Adyen dispatchers.',
    resource: 'API Credentials: Key ID key_live_9942a...',
    resourceType: 'API Key',
    resourceId: 'KEY-BILLING-01',
    detectedTime: '1 hr ago',
    owner: 'Finance Security',
    status: 'OPEN',
    recommendedAction: {
      label: 'Initiate Dual-Key Rotation Grace Period',
      actionKey: 'rotate_api_key'
    },
    details: {
      reason: 'PCI-DSS 4.0 Requirement 3.6 requires secret rotation at least annually.',
      impact: 'Automated invoice collection will halt if webhook signature verification fails.',
      evidence: [
        'Created on 2025-09-10T14:00:00Z',
        'Last authenticated request: 2026-09-08T16:22:11Z'
      ],
      auditTrail: [
        { time: '15:30:00 UTC', actor: 'Key Management Daemon', action: 'Expiry warning notification emitted' }
      ]
    }
  },
  {
    id: 'WI-8936',
    severity: 'WARNING',
    category: 'Finance',
    title: 'Vertex Cloud enterprise committed tier exceeded (118% usage)',
    description: 'Vertex Cloud has consumed 1.18M active monthly compute units against their committed 1.0M enterprise contract quota.',
    resource: 'Subscription: Vertex Cloud (SUB-VTX-09)',
    resourceType: 'Billing',
    resourceId: 'SUB-VTX-09',
    detectedTime: '2 hrs ago',
    owner: 'Account Executive / Billing Ops',
    status: 'OPEN',
    recommendedAction: {
      label: 'Provision Overage Tier or Contact Enterprise Rep',
      actionKey: 'adjust_tier'
    },
    details: {
      reason: 'Rapid expansion into EU-West regional nodes triggered overage clause.',
      impact: 'Overage billing surcharge of $4,200 pending at end of billing cycle (Sept 30).',
      evidence: [
        'Contract quota: 1,000,000 units/mo',
        'Current consumption: 1,184,290 units (Day 8 of 30)'
      ],
      auditTrail: [
        { time: '14:15:00 UTC', actor: 'Metering Service', action: 'Committed quota breached' }
      ]
    }
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'usr_01',
    name: 'Sarah Kim',
    email: 'sarah.kim@missioncontrol.io',
    avatar: 'SK',
    organizationId: 'org_acme',
    organizationName: 'Acme Corporation',
    role: 'Super Admin',
    status: 'Active',
    mfa: 'Enforced (FIDO2)',
    lastLogin: '2 mins ago',
    createdDate: '2024-03-15',
    department: 'Cloud Infrastructure & Security',
    directPermissionsCount: 38,
    inheritedPermissionsCount: 14,
    recentEventsCount: 29,
    sessions: [
      {
        id: 'sess_1',
        ip: '198.51.100.42',
        location: 'New York, United States',
        device: 'macOS Sonoma · Chrome 128',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        lastActive: 'Just now',
        isCurrent: true
      },
      {
        id: 'sess_2',
        ip: '198.51.100.45',
        location: 'New York, United States',
        device: 'iOS 18 · Safari Mobile',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
        lastActive: '4 hours ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_02',
    name: 'John Smith',
    email: 'john.smith@acme.corp',
    avatar: 'JS',
    organizationId: 'org_acme',
    organizationName: 'Acme Corporation',
    role: 'Organization Admin',
    status: 'Active',
    mfa: 'Enforced (FIDO2)',
    lastLogin: '18 mins ago',
    createdDate: '2024-06-20',
    department: 'Engineering Operations',
    directPermissionsCount: 24,
    inheritedPermissionsCount: 12,
    recentEventsCount: 12,
    sessions: [
      {
        id: 'sess_3',
        ip: '203.0.113.88',
        location: 'London, United Kingdom',
        device: 'Windows 11 · Edge 128',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        lastActive: '18 mins ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_03',
    name: 'Marcus Vance',
    email: 'marcus.vance@citadel.com',
    avatar: 'MV',
    organizationId: 'org_citadel',
    organizationName: 'Citadel Dynamics',
    role: 'Super Admin',
    status: 'Active',
    mfa: 'Not Configured',
    lastLogin: '2 mins ago',
    createdDate: '2024-01-11',
    department: 'Executive Leadership',
    directPermissionsCount: 42,
    inheritedPermissionsCount: 0,
    recentEventsCount: 4,
    sessions: [
      {
        id: 'sess_4',
        ip: '192.0.2.140',
        location: 'Frankfurt, Germany',
        device: 'macOS Sonoma · Firefox 129',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15)',
        lastActive: '2 mins ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_04',
    name: 'Helena Rostova',
    email: 'helena.rostova@citadel.com',
    avatar: 'HR',
    organizationId: 'org_citadel',
    organizationName: 'Citadel Dynamics',
    role: 'Super Admin',
    status: 'Active',
    mfa: 'Not Configured',
    lastLogin: '45 mins ago',
    createdDate: '2024-02-01',
    department: 'Security Governance',
    directPermissionsCount: 40,
    inheritedPermissionsCount: 5,
    recentEventsCount: 7,
    sessions: [
      {
        id: 'sess_5',
        ip: '192.0.2.148',
        location: 'Zurich, Switzerland',
        device: 'Linux Ubuntu · Chrome 127',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        lastActive: '45 mins ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_05',
    name: 'Elena Rostova',
    email: 'elena.r@vertexcloud.io',
    avatar: 'ER',
    organizationId: 'org_vertex',
    organizationName: 'Vertex Cloud',
    role: 'Security Officer',
    status: 'Active',
    mfa: 'Enforced (TOTP)',
    lastLogin: '1 hour ago',
    createdDate: '2024-04-10',
    department: 'Information Security',
    directPermissionsCount: 28,
    inheritedPermissionsCount: 8,
    recentEventsCount: 15,
    sessions: [
      {
        id: 'sess_6',
        ip: '198.51.100.99',
        location: 'Toronto, Canada',
        device: 'macOS Sequoia · Brave 1.68',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        lastActive: '1 hour ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_06',
    name: 'David Chen',
    email: 'd.chen@novushealth.org',
    avatar: 'DC',
    organizationId: 'org_novus',
    organizationName: 'Novus Health Global',
    role: 'DevOps Lead',
    status: 'Active',
    mfa: 'Enforced (FIDO2)',
    lastLogin: '35 mins ago',
    createdDate: '2024-07-01',
    department: 'Site Reliability Engineering',
    directPermissionsCount: 30,
    inheritedPermissionsCount: 6,
    recentEventsCount: 34,
    sessions: [
      {
        id: 'sess_7',
        ip: '203.0.113.12',
        location: 'San Francisco, United States',
        device: 'macOS Sonoma · Terminal/SSH & Chrome',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        lastActive: '35 mins ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_07',
    name: 'Kavita Patel',
    email: 'kavita.patel@hyperion.com',
    avatar: 'KP',
    organizationId: 'org_hyperion',
    organizationName: 'Hyperion Global Systems',
    role: 'Compliance Auditor',
    status: 'Active',
    mfa: 'Enforced (TOTP)',
    lastLogin: '3 hours ago',
    createdDate: '2024-08-15',
    department: 'Regulatory Compliance & GRC',
    directPermissionsCount: 14,
    inheritedPermissionsCount: 10,
    recentEventsCount: 19,
    sessions: [
      {
        id: 'sess_8',
        ip: '198.51.100.120',
        location: 'Austin, United States',
        device: 'Windows 11 Enterprise · Chrome',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        lastActive: '3 hours ago',
        isCurrent: false
      }
    ]
  },
  {
    id: 'usr_08',
    name: 'Liam Gallagher',
    email: 'liam.g@acme.corp',
    avatar: 'LG',
    organizationId: 'org_acme',
    organizationName: 'Acme Corporation',
    role: 'Analyst',
    status: 'Suspended',
    mfa: 'Exempted',
    lastLogin: '14 days ago',
    createdDate: '2024-05-12',
    department: 'Data Operations',
    directPermissionsCount: 8,
    inheritedPermissionsCount: 4,
    recentEventsCount: 1,
    sessions: []
  },
  {
    id: 'usr_09',
    name: 'Aisha Al-Mansoor',
    email: 'aisha.m@citadel.com',
    avatar: 'AA',
    organizationId: 'org_citadel',
    organizationName: 'Citadel Dynamics',
    role: 'Organization Admin',
    status: 'Pending Invite',
    mfa: 'Not Configured',
    lastLogin: 'Never',
    createdDate: '2026-09-07',
    department: 'EMEA Regional Operations',
    directPermissionsCount: 22,
    inheritedPermissionsCount: 5,
    recentEventsCount: 0,
    sessions: []
  }
];

export const INITIAL_ORGANIZATIONS: Organization[] = [
  {
    id: 'org_acme',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    tier: 'Enterprise Dedicated',
    domain: 'acme.corp',
    usersCount: 42180,
    ssoStatus: 'Healthy',
    complianceStatus: 'SOC2 Type II Compliant',
    mfaEnforced: true,
    region: 'us-east-1',
    monthlySpend: 48500,
    createdAt: '2023-01-10',
    activeIncidents: 1
  },
  {
    id: 'org_citadel',
    name: 'Citadel Dynamics',
    slug: 'citadel-dyn',
    tier: 'Enterprise Dedicated',
    domain: 'citadel.com',
    usersCount: 31200,
    ssoStatus: 'Degraded',
    complianceStatus: 'ISO 27001 Pending',
    mfaEnforced: false,
    region: 'eu-west-1',
    monthlySpend: 62000,
    createdAt: '2023-04-18',
    activeIncidents: 2
  },
  {
    id: 'org_vertex',
    name: 'Vertex Cloud Technologies',
    slug: 'vertex-cloud',
    tier: 'Enterprise Plus',
    domain: 'vertexcloud.io',
    usersCount: 18450,
    ssoStatus: 'Healthy',
    complianceStatus: 'SOC2 Type II Compliant',
    mfaEnforced: true,
    region: 'us-east-1',
    monthlySpend: 29400,
    createdAt: '2023-08-04',
    activeIncidents: 1
  },
  {
    id: 'org_novus',
    name: 'Novus Health Global',
    slug: 'novus-health',
    tier: 'Enterprise Dedicated',
    domain: 'novushealth.org',
    usersCount: 22800,
    ssoStatus: 'Healthy',
    complianceStatus: 'HIPAA Ready',
    mfaEnforced: true,
    region: 'us-east-1',
    monthlySpend: 54100,
    createdAt: '2023-11-20',
    activeIncidents: 0
  },
  {
    id: 'org_hyperion',
    name: 'Hyperion Global Systems',
    slug: 'hyperion-global',
    tier: 'Standard Enterprise',
    domain: 'hyperion.com',
    usersCount: 9952,
    ssoStatus: 'Configuring',
    complianceStatus: 'SOC2 Type II Compliant',
    mfaEnforced: true,
    region: 'ap-southeast-1',
    monthlySpend: 16800,
    createdAt: '2024-02-14',
    activeIncidents: 0
  }
];

export const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'aud_9941',
    requestId: 'req_8f91a0c49b',
    timestamp: '2026-09-08 14:31:22 UTC',
    actor: {
      name: 'Sarah Kim',
      email: 'sarah.kim@missioncontrol.io',
      role: 'Super Admin',
      ip: '198.51.100.42',
      location: 'New York, US'
    },
    action: 'USER_ROLE_CHANGED',
    resource: 'User: John Smith (usr_02)',
    resourceType: 'User',
    category: 'Security',
    severity: 'high',
    reason: 'Emergency on-call coverage for Q3 EU Infrastructure Deployment cycle.',
    authContext: 'RBAC Policy: SEC-SUPER-OVERRIDE (Signed with Hardware Token YubiKey-5C)',
    beforeState: {
      role: 'Analyst',
      permissions: ['telemetry:read', 'logs:read', 'dashboards:view'],
      mfa_enforced: true,
      status: 'Active'
    },
    afterState: {
      role: 'Organization Admin',
      permissions: ['telemetry:read', 'logs:read', 'dashboards:view', 'users:manage', 'org:configure', 'keys:read'],
      mfa_enforced: true,
      status: 'Active'
    }
  },
  {
    id: 'aud_9940',
    requestId: 'req_3e21ff810d',
    timestamp: '2026-09-08 13:14:05 UTC',
    actor: {
      name: 'Elena Rostova',
      email: 'elena.r@vertexcloud.io',
      role: 'Security Officer',
      ip: '198.51.100.99',
      location: 'Toronto, CA'
    },
    action: 'API_KEY_ROTATED',
    resource: 'API Key: srv-metrics-ingest-v2',
    resourceType: 'API Key',
    category: 'API',
    severity: 'medium',
    reason: 'Routine 90-day cryptographic secret rotation for production metric collector.',
    authContext: 'ABAC Rule: Scope match `arn:aws:iam::enterprise:apikey/collector`',
    beforeState: {
      keyId: 'key_live_old_3914a',
      status: 'ACTIVE',
      expiresAt: '2026-09-15T00:00:00Z',
      allowedCidrs: ['10.0.0.0/16', '198.51.100.0/24']
    },
    afterState: {
      keyId: 'key_live_new_8892f',
      status: 'ACTIVE_GRACE_PERIOD',
      previousKeyRevokesAt: '2026-09-09T13:14:05Z',
      allowedCidrs: ['10.0.0.0/16', '198.51.100.0/24']
    }
  },
  {
    id: 'aud_9939',
    requestId: 'req_11a84f09cb',
    timestamp: '2026-09-08 12:45:10 UTC',
    actor: {
      name: 'System Daemon (Scheduler)',
      email: 'workflow-engine@system.internal',
      role: 'System Service',
      ip: '10.240.12.88',
      location: 'Internal AWS VPC'
    },
    action: 'WORKFLOW_COMPLETED',
    resource: 'Workflow: Daily Ledger Partition Rollup',
    resourceType: 'Workflow',
    category: 'Workflow',
    severity: 'low',
    reason: 'Scheduled cron execution `0 12 * * *`. Processed 4.8M records across 12 partitions.',
    authContext: 'Internal Service Principal `sp-workflow-engine`',
    beforeState: {
      executionId: 'wf_exec_9091',
      status: 'RUNNING',
      recordsProcessed: 120400
    },
    afterState: {
      executionId: 'wf_exec_9091',
      status: 'SUCCESS',
      recordsProcessed: 4819200,
      durationSeconds: 312
    }
  },
  {
    id: 'aud_9938',
    requestId: 'req_77d298ea10',
    timestamp: '2026-09-08 11:20:00 UTC',
    actor: {
      name: 'Marcus Vance',
      email: 'marcus.vance@citadel.com',
      role: 'Super Admin',
      ip: '192.0.2.140',
      location: 'Frankfurt, DE'
    },
    action: 'SECURITY_POLICY_MODIFIED',
    resource: 'Policy: Enterprise Session Inactivity Timeout',
    resourceType: 'Policy',
    category: 'Policy',
    severity: 'critical',
    reason: 'Adjusted idle session cutoff from 15m to 60m for control room wallboard workstations.',
    authContext: 'Enterprise Admin Direct Authorization',
    beforeState: {
      policyId: 'pol_session_idle',
      idleTimeoutMinutes: 15,
      requireReAuthOnIpDrift: true,
      exemptWorkstations: []
    },
    afterState: {
      policyId: 'pol_session_idle',
      idleTimeoutMinutes: 60,
      requireReAuthOnIpDrift: true,
      exemptWorkstations: ['192.0.2.140', '192.0.2.141']
    }
  },
  {
    id: 'aud_9937',
    requestId: 'req_55b39900c1',
    timestamp: '2026-09-08 10:05:44 UTC',
    actor: {
      name: 'Stripe Webhook Gateway',
      email: 'billing-dispatcher@gateway.internal',
      role: 'Integration Principal',
      ip: '54.187.205.235',
      location: 'Stripe Edge'
    },
    action: 'INVOICE_GENERATED',
    resource: 'Invoice: INV-2026-09-8812 (Acme Corp)',
    resourceType: 'Billing',
    category: 'Billing',
    severity: 'low',
    reason: 'Monthly recurring enterprise seat and tier settlement generated.',
    authContext: 'HMAC Webhook Signature Verified (whsec_9942a...)',
    beforeState: null,
    afterState: {
      invoiceId: 'INV-2026-09-8812',
      organization: 'Acme Corporation',
      amount: 48500.00,
      status: 'PAID',
      paymentMethod: 'ACH Wire (JPMorgan Chase ****4910)'
    }
  }
];

export const INITIAL_SYSTEM_HEALTH: SystemHealthItem[] = [
  {
    id: 'srv_auth',
    name: 'Unified IAM & Auth Service',
    category: 'Core Service',
    status: 'operational',
    latencyP95: 18,
    latencyP99: 34,
    errorRate: 0.002,
    uptime30d: 99.995,
    nodes: 16,
    errorBudgetRemaining: 94.2,
    region: 'Global Multi-Region'
  },
  {
    id: 'srv_ingest',
    name: 'Real-time Event Ingestion Mesh',
    category: 'Data Pipeline',
    status: 'degraded',
    latencyP95: 68,
    latencyP99: 142,
    errorRate: 0.048,
    uptime30d: 99.940,
    nodes: 48,
    errorBudgetRemaining: 68.5,
    region: 'us-east-1'
  },
  {
    id: 'srv_workflow',
    name: 'Workflow Orchestration Engine',
    category: 'Core Service',
    status: 'operational',
    latencyP95: 22,
    latencyP99: 45,
    errorRate: 0.008,
    uptime30d: 99.988,
    nodes: 24,
    errorBudgetRemaining: 91.0,
    region: 'us-east-1'
  },
  {
    id: 'srv_db',
    name: 'Aurora Multi-Master Primary Cluster',
    category: 'Core Service',
    status: 'operational',
    latencyP95: 9,
    latencyP99: 19,
    errorRate: 0.001,
    uptime30d: 99.999,
    nodes: 8,
    errorBudgetRemaining: 99.1,
    region: 'us-east-1 (Multi-AZ)'
  },
  {
    id: 'srv_redis',
    name: 'Distributed Redis State Cache (Cluster)',
    category: 'Edge & Network',
    status: 'operational',
    latencyP95: 2,
    latencyP99: 5,
    errorRate: 0.000,
    uptime30d: 100.000,
    nodes: 12,
    errorBudgetRemaining: 100.0,
    region: 'us-east-1 / eu-west-1'
  },
  {
    id: 'srv_scim',
    name: 'Directory SCIM & SAML Broker',
    category: 'Security Mesh',
    status: 'degraded',
    latencyP95: 450,
    latencyP99: 2100,
    errorRate: 4.820,
    uptime30d: 99.810,
    nodes: 6,
    errorBudgetRemaining: 22.4,
    region: 'Global Edge'
  }
];

export const INITIAL_INTEGRATIONS: Integration[] = [
  {
    id: 'int_okta',
    name: 'Okta Enterprise SSO & SCIM',
    type: 'IAM',
    status: 'DEGRADED',
    lastSync: '4 mins ago (Error)',
    errorCount24h: 14,
    throughput: '420 requests/min',
    syncInterval: '5 minutes',
    apiVersion: 'v2.1',
    endpoint: 'https://acme-sso.okta.com/api/v1'
  },
  {
    id: 'int_aws',
    name: 'AWS GovCloud & Commercial IAM',
    type: 'Cloud Provider',
    status: 'CONNECTED',
    lastSync: '1 min ago',
    errorCount24h: 0,
    throughput: '8,400 events/sec',
    syncInterval: 'Realtime Webhook',
    apiVersion: '2010-05-08',
    endpoint: 'arn:aws:iam::129481029481:role/EnterpriseMC'
  },
  {
    id: 'int_datadog',
    name: 'Datadog Enterprise APM',
    type: 'Observability',
    status: 'CONNECTED',
    lastSync: 'Just now',
    errorCount24h: 2,
    throughput: '45,000 metrics/sec',
    syncInterval: 'Streaming gRPC',
    apiVersion: 'v2',
    endpoint: 'https://api.datadoghq.com/api/v2'
  },
  {
    id: 'int_slack',
    name: 'Slack Security Incident Bot',
    type: 'Communications',
    status: 'CONNECTED',
    lastSync: 'Just now',
    errorCount24h: 0,
    throughput: '22 notifications/hr',
    syncInterval: 'Event-driven',
    apiVersion: 'v1.4',
    endpoint: 'https://hooks.slack.com/services/T00/B00/XXXX'
  },
  {
    id: 'int_splunk',
    name: 'Splunk Enterprise SIEM Forwarder',
    type: 'SIEM',
    status: 'CONNECTED',
    lastSync: '2 mins ago',
    errorCount24h: 0,
    throughput: '12.4 MB/sec',
    syncInterval: 'Batch Buffer (10s)',
    apiVersion: 'v8.2',
    endpoint: 'https://splunk-hec.missioncontrol.internal:8088'
  },
  {
    id: 'int_salesforce',
    name: 'Salesforce CRM Enterprise Sync',
    type: 'CRM',
    status: 'CONNECTED',
    lastSync: '12 mins ago',
    errorCount24h: 1,
    throughput: '140 syncs/hr',
    syncInterval: '15 minutes',
    apiVersion: 'v58.0',
    endpoint: 'https://acme.my.salesforce.com/services/data/v58.0'
  }
];

export const INITIAL_WORKFLOWS: Workflow[] = [
  {
    id: 'wf_01',
    name: 'WF-NIGHTLY-RECON-US: Billing & Ledger Reconciliation',
    trigger: 'Schedule (Cron)',
    status: 'FAILED',
    duration: '10m 02s (Timeout)',
    lastRun: '28 mins ago',
    environment: 'Production',
    errorDetails: {
      step: 'Snowflake Ledger Query Execution',
      message: 'SQL execution exceeded statement timeout limit of 600 seconds on warehouse WH_ETL_XL',
      retryCount: 2
    },
    steps: [
      { name: 'Extract Stripe Ingestion Batches', status: 'success', duration: '42s' },
      { name: 'Sanitize & Deduplicate Ledger Tx', status: 'success', duration: '1m 14s' },
      { name: 'Snowflake Ledger Query Execution', status: 'failed', duration: '10m 00s', logSnippet: 'FATAL: Statement cancelled after 600000ms by resource manager.' },
      { name: 'Generate GAAP Compliance Report', status: 'queued', duration: '0s' },
      { name: 'Notify Finance On-Call Slack', status: 'queued', duration: '0s' }
    ]
  },
  {
    id: 'wf_02',
    name: 'WF-IAM-AUDIT: Automated Privileged Credential Rotation Scan',
    trigger: 'Schedule (Cron)',
    status: 'SUCCESS',
    duration: '2m 14s',
    lastRun: '1 hour ago',
    environment: 'Production',
    steps: [
      { name: 'Fetch Active IAM Access Keys', status: 'success', duration: '18s' },
      { name: 'Evaluate 90-Day Rotation Policy', status: 'success', duration: '32s' },
      { name: 'Check Hardware MFA Enrollment', status: 'success', duration: '41s' },
      { name: 'Publish Compliance Telemetry', status: 'success', duration: '43s' }
    ]
  },
  {
    id: 'wf_03',
    name: 'WF-PROVISION-USER: Enterprise Okta SCIM Lifecycle Worker',
    trigger: 'Webhook',
    status: 'RUNNING',
    duration: '1m 40s',
    lastRun: 'In Progress',
    environment: 'Production',
    steps: [
      { name: 'Verify Webhook Signature', status: 'success', duration: '120ms' },
      { name: 'Parse SCIM 2.0 User Payload', status: 'success', duration: '340ms' },
      { name: 'Enforce Organization RBAC Profile', status: 'running', duration: '1m 39s' },
      { name: 'Dispatch Welcome Verification SMS', status: 'queued', duration: '0s' }
    ]
  }
];

export const INITIAL_AI_INSIGHTS: AIInsight[] = [
  {
    id: 'ai_01',
    title: 'Unusual API traffic detected: +41% above 30-day baseline',
    anomalyType: 'Traffic Volume Anomaly (Statistical Z-Score: 4.12)',
    confidence: 89.4,
    baselineComparison: 'Observed 84,200 req/min vs standard historical envelope of 59,700 req/min (±3,200).',
    potentialCause: 'Newly deployed Datadog metric scraper daemon (v2.4.1) running without polling throttle.',
    evidence: [
      'Traffic source isolated to single token: `srv_datadog_agent_prod`',
      'Target endpoint: 94% focused on `/v2/organizations/*/usage-meters`',
      'Cluster CPU utilization rose from 34% to 58% concurrently'
    ],
    affectedSystems: ['Core API Gateway', 'Aurora Read Replicas (Cluster 2)', 'Redis Rate-Limiter Pods'],
    recommendedAction: {
      label: 'Apply Dynamic Token Rate-Limit Profile (1,000 req/min)',
      actionType: 'apply_rate_limit_datadog',
      description: 'Constrain `srv_datadog_agent_prod` to 1,000 req/min without disconnecting telemetry stream.'
    },
    detectedTime: '42 mins ago'
  },
  {
    id: 'ai_02',
    title: 'Likely cascading timeout risk on Okta SCIM connector',
    anomalyType: 'Latency Drift & Predictive Failure Model',
    confidence: 94.1,
    baselineComparison: 'SCIM gateway response latency transitioned from 240ms P95 to 4,800ms P95 over 45 minutes.',
    potentialCause: 'Upstream Okta rate-limit 429 throttling returning cached 502 proxies.',
    evidence: [
      'Consecutive 502 Bad Gateway responses on SCIM v2 batch ingestion',
      'Retry storm detected: 14 automated retries spawned with 0s jitter',
      'Upstream edge IP 52.84.18.23 returning `X-RateLimit-Remaining: 0`'
    ],
    affectedSystems: ['Okta SCIM Integration', 'Enterprise User Provisioning Pipeline'],
    recommendedAction: {
      label: 'Engage Exponential Jitter Backoff (5m cooldown)',
      actionType: 'engage_scim_backoff',
      description: 'Temporarily pause retry storm and enable 300s exponential backoff window.'
    },
    detectedTime: '15 mins ago'
  },
  {
    id: 'ai_03',
    title: 'Predicted enterprise invoice reconciliation drift for Acme Corp',
    anomalyType: 'Financial Ledger Anomaly',
    confidence: 81.2,
    baselineComparison: 'Contracted usage meters report $48,500 expected vs $54,120 calculated preliminary.',
    potentialCause: 'Unmapped add-on seat licenses added during mid-month EMEA tenant migration.',
    evidence: [
      'Delta of +142 seats in EU-West partition without associated contract line item',
      'Billing currency mismatch: 12 invoices pending in EUR converted with stale FX rate'
    ],
    affectedSystems: ['Billing Calculation Engine', 'Stripe Connector'],
    recommendedAction: {
      label: 'Trigger FX Re-sync & Map EMEA Line Items',
      actionType: 'reconcile_billing_fx',
      description: 'Pull live European Central Bank FX rates and link unallocated seats to Enterprise Addendum #4.'
    },
    detectedTime: '1 hour ago'
  }
];

export const INITIAL_ROLES: RoleDefinition[] = [
  {
    id: 'role_super_admin',
    name: 'Super Admin (Platform Owner)',
    description: 'Unrestricted global operational control plane authority across all multi-tenant organizations.',
    assignedUsersCount: 3,
    isSystem: true,
    permissions: [
      { domain: 'Users & Identity', description: 'Manage accounts, MFA exceptions, session termination', read: true, write: true, delete: true, admin: true },
      { domain: 'Organizations & Tenants', description: 'Provision tenants, modify limits, tier overrides', read: true, write: true, delete: true, admin: true },
      { domain: 'Security & Access (RBAC/ABAC)', description: 'Edit permissions, create roles, rotate root keys', read: true, write: true, delete: true, admin: true },
      { domain: 'Workflows & Jobs', description: 'Replay failed jobs, modify DAG configurations', read: true, write: true, delete: true, admin: true },
      { domain: 'Finance & Invoicing', description: 'Authorize contract billing, issue credit memos', read: true, write: true, delete: true, admin: true },
      { domain: 'Audit & Compliance', description: 'Access tamper-evident cryptographic log streams', read: true, write: false, delete: false, admin: true },
      { domain: 'System Infrastructure', description: 'Trigger node scaling, toggle maintenance windows', read: true, write: true, delete: true, admin: true }
    ]
  },
  {
    id: 'role_org_admin',
    name: 'Organization Admin',
    description: 'Full administrative authority scoped strictly to the designated tenant enterprise boundary.',
    assignedUsersCount: 18,
    isSystem: true,
    permissions: [
      { domain: 'Users & Identity', description: 'Manage accounts, invite team members within organization', read: true, write: true, delete: true, admin: false },
      { domain: 'Organizations & Tenants', description: 'View tenant profile and settings', read: true, write: true, delete: false, admin: false },
      { domain: 'Security & Access (RBAC/ABAC)', description: 'Assign predefined roles to members', read: true, write: true, delete: false, admin: false },
      { domain: 'Workflows & Jobs', description: 'View and run organization-specific automation', read: true, write: true, delete: false, admin: false },
      { domain: 'Finance & Invoicing', description: 'Download invoices and view payment methods', read: true, write: false, delete: false, admin: false },
      { domain: 'Audit & Compliance', description: 'View organization-scoped audit events', read: true, write: false, delete: false, admin: false },
      { domain: 'System Infrastructure', description: 'No infrastructure access', read: false, write: false, delete: false, admin: false }
    ]
  },
  {
    id: 'role_sec_officer',
    name: 'Security Officer',
    description: 'Cybersecurity governance, SIEM integration management, and real-time incident triage.',
    assignedUsersCount: 6,
    isSystem: false,
    permissions: [
      { domain: 'Users & Identity', description: 'Inspect sessions, enforce MFA, trigger emergency suspension', read: true, write: true, delete: false, admin: false },
      { domain: 'Organizations & Tenants', description: 'Inspect security posture of all organizations', read: true, write: false, delete: false, admin: false },
      { domain: 'Security & Access (RBAC/ABAC)', description: 'Manage SSO, rotate API keys, inspect policy violations', read: true, write: true, delete: true, admin: true },
      { domain: 'Workflows & Jobs', description: 'Inspect workflow security integrity', read: true, write: false, delete: false, admin: false },
      { domain: 'Finance & Invoicing', description: 'No billing access', read: false, write: false, delete: false, admin: false },
      { domain: 'Audit & Compliance', description: 'Full access to audit trails and SIEM forwards', read: true, write: false, delete: false, admin: true },
      { domain: 'System Infrastructure', description: 'Inspect security mesh and edge firewall telemetry', read: true, write: false, delete: false, admin: false }
    ]
  },
  {
    id: 'role_devops_lead',
    name: 'DevOps & SRE Lead',
    description: 'System health, pipeline operations, microservice node telemetry, and workflow triage.',
    assignedUsersCount: 9,
    isSystem: false,
    permissions: [
      { domain: 'Users & Identity', description: 'Inspect service accounts and worker principals', read: true, write: true, delete: false, admin: false },
      { domain: 'Organizations & Tenants', description: 'Inspect tenant resource quotas and usage', read: true, write: false, delete: false, admin: false },
      { domain: 'Security & Access (RBAC/ABAC)', description: 'View assigned operational roles', read: true, write: false, delete: false, admin: false },
      { domain: 'Workflows & Jobs', description: 'Full control over background jobs and DAG executions', read: true, write: true, delete: true, admin: true },
      { domain: 'Finance & Invoicing', description: 'No billing access', read: false, write: false, delete: false, admin: false },
      { domain: 'Audit & Compliance', description: 'Read-only access to operational logs', read: true, write: false, delete: false, admin: false },
      { domain: 'System Infrastructure', description: 'Manage microservices, nodes, and cluster metrics', read: true, write: true, delete: false, admin: true }
    ]
  },
  {
    id: 'role_auditor',
    name: 'Compliance Auditor',
    description: 'Read-only visibility into system records, tamper-evident logs, and regulatory compliance evidence.',
    assignedUsersCount: 4,
    isSystem: true,
    permissions: [
      { domain: 'Users & Identity', description: 'Read user records and login timestamps', read: true, write: false, delete: false, admin: false },
      { domain: 'Organizations & Tenants', description: 'Read organization configurations', read: true, write: false, delete: false, admin: false },
      { domain: 'Security & Access (RBAC/ABAC)', description: 'Review permissions and authorization rules', read: true, write: false, delete: false, admin: false },
      { domain: 'Workflows & Jobs', description: 'Inspect execution logs', read: true, write: false, delete: false, admin: false },
      { domain: 'Finance & Invoicing', description: 'View audit receipts and invoice records', read: true, write: false, delete: false, admin: false },
      { domain: 'Audit & Compliance', description: 'Full read access to all audit events and diffs', read: true, write: false, delete: false, admin: false },
      { domain: 'System Infrastructure', description: 'Inspect uptime statistics and SLA compliance', read: true, write: false, delete: false, admin: false }
    ]
  }
];

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv_8812',
    number: 'INV-2026-09-8812',
    organizationName: 'Acme Corporation',
    amount: 48500.00,
    status: 'PAID',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    paymentMethod: 'ACH Wire (JPMorgan Chase ****4910)',
    itemizedCount: 14
  },
  {
    id: 'inv_8811',
    number: 'INV-2026-09-8811',
    organizationName: 'Citadel Dynamics',
    amount: 62000.00,
    status: 'DUE',
    issueDate: '2026-09-01',
    dueDate: '2026-09-15',
    paymentMethod: 'Corporate Card (Amex ****8011)',
    itemizedCount: 22
  },
  {
    id: 'inv_8810',
    number: 'INV-2026-09-8810',
    organizationName: 'Vertex Cloud Technologies',
    amount: 29400.00,
    status: 'PAID',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    paymentMethod: 'ACH Wire (Silicon Valley Bank ****2901)',
    itemizedCount: 8
  },
  {
    id: 'inv_8809',
    number: 'INV-2026-09-8809',
    organizationName: 'Novus Health Global',
    amount: 54100.00,
    status: 'PAID',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    paymentMethod: 'ACH Wire (Bank of America ****9124)',
    itemizedCount: 18
  },
  {
    id: 'inv_8808',
    number: 'INV-2026-09-8808',
    organizationName: 'Hyperion Global Systems',
    amount: 16800.00,
    status: 'DUE',
    issueDate: '2026-09-01',
    dueDate: '2026-09-20',
    paymentMethod: 'Corporate Card (Visa ****3381)',
    itemizedCount: 6
  }
];
