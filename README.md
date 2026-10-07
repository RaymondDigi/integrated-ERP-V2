# 🌐 Integrated ERP (IntergratedERP)

> **Next-Generation Multi-Tenant Enterprise Resource Planning & Human Capital Management Platform**  
> Built with React 19, TypeScript, Vite, and Modern Enterprise Design Principles.

[![React](https://img.shields.io/badge/React-19.2.8-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646cff?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Lucide Icons](https://img.shields.io/badge/Lucide-Icons-f59e0b?style=flat-square)](https://lucide.dev/)
[![Kenya Statutory Compliant](https://img.shields.io/badge/Statutory-KRA%20%7C%20NSSF%20%7C%20SHIF%20%7C%20AHL-22c55e?style=flat-square)](#7-kenyan-statutory--global-payroll-engine)
[![Multi-Tenant Architecture](https://img.shields.io/badge/Architecture-Multi--Tenant%20Enterprise-8b5cf6?style=flat-square)](#multi-tenant-organization-setup)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture & Core Suites](#-system-architecture--core-suites)
- [DigiCraft Launchpad & AI Copilot](#-digicraft-launchpad--ai-copilot)
- [Human Capital Management (12-Stage Lifecycle)](#-human-capital-management-hcm-12-stage-lifecycle)
  - [1. Employee Requisitions & Manpower Planning](#1-employee-requisitions--manpower-planning)
  - [2. Recruitment & Applicant Tracking (ATS)](#2-recruitment--applicant-tracking-ats)
  - [3. Employee Onboarding & Digital KYC](#3-employee-onboarding--digital-kyc)
  - [4. Employee Master Directory & Dossier](#4-employee-master-directory--dossier)
  - [5. Attendance, Time Tracking & Biometric ADMS](#5-attendance-time-tracking--biometric-adms)
  - [6. Leave Management & Accrual Engine](#6-leave-management--accrual-engine)
  - [7. Kenyan Statutory & Global Payroll Engine](#7-kenyan-statutory--global-payroll-engine)
  - [8. Performance Management & Appraisals](#8-performance-management--appraisals)
  - [9. Training, Certifications & Skills Matrix](#9-training-certifications--skills-matrix)
  - [10. Disciplinary & Labor Law Compliance (Sec 37)](#10-disciplinary--labor-law-compliance-sec-37)
  - [11. OSH, DOSHS Compliance & High-Risk Permits](#11-osh-doshs-compliance--high-risk-permits)
  - [12. Separation, Exit Clearances & Statutory P9](#12-separation-exit-clearances--statutory-p9)
- [Employee Self-Service (ESS) Portal](#-employee-self-service-ess-portal)
- [Financial Management Suite](#-financial-management-suite)
- [Commercial & Supply Chain Suite](#-commercial--supply-chain-suite)
  - [Trading & Sales Fulfilment](#trading--sales-fulfilment)
  - [Procurement & Purchasing](#procurement--purchasing)
  - [Business Development & Pipeline](#business-development--pipeline)
- [Operations & Logistics Suite](#-operations--logistics-suite)
  - [Warehousing & Stock Movements](#warehousing--stock-movements)
  - [Production & Manufacturing](#production--manufacturing)
  - [Shipping & Freight](#shipping--freight)
  - [Fleet Management & Maintenance](#fleet-management--maintenance)
- [Governance, Control & Quality Suite](#-governance-control--quality-suite)
- [Executive Intelligence & Unified Approvals Hub](#-executive-intelligence--unified-approvals-hub)
- [Enterprise Platform Administration & Security](#-enterprise-platform-administration--security)
- [Multi-Tenant Organization Setup](#-multi-tenant-organization-setup)
- [Technology Stack](#-technology-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Local Run](#installation--local-run)
  - [Building for Production](#building-for-production)
  - [Docker Deployment](#docker-deployment)
- [Project Directory Structure](#-project-directory-structure)
- [License](#-license)

---

## 🌟 Overview

**Integrated ERP (IntergratedERP)** is an enterprise-grade cloud enterprise resource planning suite engineered to unify all facets of modern business operations into a cohesive, high-performance web experience. 

Designed for mid-market to large multi-entity enterprises—with native compliance for the Kenyan regulatory landscape (KRA PAYE, NSSF Tier I/II, SHIF, Affordable Housing Levy, DOSHS, Employment Act)—the system brings together:
- Complete end-to-end Human Capital Management (HCM)
- Full-accrual Double-Entry Financial Accounting
- Multi-channel Commercial Trading & Procurement
- Production, Warehousing, Fleet & Maintenance Logistics
- Unified Corporate Governance, Auditing, and Executive Intelligence

---

## 🏛️ System Architecture & Core Suites

```
                                 ┌────────────────────────────────────────────────────────┐
                                 │              DIGICRAFT LAUNCHPAD & SHELL               │
                                 │       (Global Search, AI Copilot, Command Palette)     │
                                 └──────────────────────────┬─────────────────────────────┘
                                                            │
    ┌───────────────────────┬───────────────────────────────┼──────────────────────────────┬─────────────────────────┐
    ▼                       ▼                               ▼                              ▼                         ▼
┌──────────────┐   ┌─────────────────┐           ┌───────────────────┐          ┌───────────────────┐   ┌───────────────────┐
│     HCM      │   │     FINANCE     │           │    COMMERCIAL     │          │    OPERATIONS     │   │ CONTROL & EXEC    │
│  LIFECYCLE   │   │      SUITE      │           │       SUITE       │          │       SUITE       │   │       SUITE       │
├──────────────┤   ├─────────────────┤           ├───────────────────┤          ├───────────────────┤   ├───────────────────┤
│ Requisitions │   │ General Ledger  │           │ Sales & Quotation │          │ Multi-Warehouse   │   │ Quality Assurance │
│ Recruitment  │   │ AR & Invoicing  │           │ Purchase Orders   │          │ BOM & Production  │   │ ICT Infrastructure│
│ Onboarding   │   │ AP & Bills      │           │ Sourcing & Quotes │          │ Shipping & Waybill│   │ Integrations Hub  │
│ Master Dir   │   │ Bank Rec        │           │ Product Catalog   │          │ Fleet Telematics  │   │ Risk & Governance │
│ Biometrics   │   │ Fixed Assets    │           │ Customer Ledger   │          │ Plant Maintenance │   │ Unified Approvals │
│ Leave Engine │   │ Budget Variance │           │ Supplier Ledger   │          │ Stock Movements   │   │ Executive Suite   │
│ Statutory Pay│   │ Financial Rpts  │           │ BizDev Pipeline   │          │ Count Variance    │   │ AI Insights       │
│ Performance  │   │ Month-End Close │           └───────────────────┘          └───────────────────┘   └───────────────────┘
│ Training & HR│   └─────────────────┘
│ Disciplinary │
│ OSH Permits  │
│ Separation   │
└──────────────┘
```

---

## 🚀 DigiCraft Launchpad & AI Copilot

- **Visual Application Launcher (`DigiCraftAppGrid`)**: High-contrast, beautifully themed launcher cards categorized across Talent Acquisition, Core HR, Payroll, Operations, and Governance.
- **Guided AI Intelligence Onboarding**: Step-by-step interactive walkthrough that guides users through company setup, manpower planning, payroll execution, and operations.
- **Global Command Palette (`Ctrl+K` / `Cmd+K`)**: Instant fuzzy search across employees, invoices, purchase orders, products, and system actions.
- **AI Assistant Drawer**: Embedded context-aware assistant capable of answering questions, summarizing work queues, and drafting approvals.
- **Multi-Tenant Fast Switcher**: Instantly pivot between corporate entities (e.g. Headquarters, Manufacturing Factories, Outgrower Cooperatives, Logistics Units).

---

## 👥 Human Capital Management (HCM) 12-Stage Lifecycle

Integrated ERP models the employee lifecycle across 12 sequential, compliant milestones:

### 1. Employee Requisitions & Manpower Planning
- **Budget Control**: Headcount budget enforcement against approved department ceilings.
- **Multi-Tier Approvals**: Line Manager $\rightarrow$ HR Director $\rightarrow$ Finance $\rightarrow$ Executive approvals.
- **Job Descriptions**: Built-in competency profiling, qualifications, salary scale bands, and replacement justifications.

### 2. Recruitment & Applicant Tracking (ATS)
- **Hiring Pipeline**: Multi-stage candidate tracker (Applied $\rightarrow$ Screening $\rightarrow$ Aptitude Test $\rightarrow$ Panel Interview $\rightarrow$ Offer Letter).
- **Evaluation Scorecards**: Standardized interviewer scoring out of 100 with objective rubrics.
- **Intern & Attachee Tracking**: Specialized flags for academic internships and industrial attachments.

### 3. Employee Onboarding & Digital KYC
- **Statutory Document Verification**: Pre-boarding checklist tracking KRA PIN, NSSF Number, SHIF/NHIF Number, and National ID.
- **Starter Kit & Assets**: Physical equipment provisioning (laptops, uniforms, safety gear, keys).
- **Automated Master Conversion**: Seamless transition from accepted applicant to active employee master record upon contract signature.

### 4. Employee Master Directory & Dossier
- **360° Employee Profiles**: Personal details, statutory numbers (masked for privacy), banking/M-Pesa payment coordinates, emergency contacts, and next of kin.
- **Contract Type Architecture**: Support for Salaried Monthly, Daily Casual, and Piece-Rate Output contracts.
- **Historic Tracking**: Audited timelines for basic salary adjustments, promotions, regrading, and inter-department transfers.
- **Custom Dynamic Fields**: Enterprise-configurable metadata fields by department or organization.

### 5. Attendance, Time Tracking & Biometric ADMS
- **Multi-Source Clocking**: Direct integration with Biometric ADMS hardware, GPS geofenced mobile clock-ins, and production tally counters.
- **Geofence Protection**: Anti-spoofing engine detecting mock locations and out-of-bounds punch attempts.
- **Piece-Rate Production Tallies**: Daily harvest/manufacturing units recorded directly to employee payroll ledgers.
- **Shift & Overtime Computation**: Automatic tracking of standard 1.5x weekday overtime and 2.0x holiday/rest-day rates.

### 6. Leave Management & Accrual Engine
- **Comprehensive Leave Policies**: Annual, Sick Leave (Full Pay & Half Pay), Maternity (90 days), Paternity (14 days), Compassionate, Study, and Unpaid Leave.
- **Automated Accrual & Balance Ledger**: Monthly or upfront entitlement allocations with customizable carry-over limits.
- **Leave Allowance Automation**: Flags and triggers mandatory annual leave travel/subsistence allowances on qualifying bookings.
- **Two-Step Approval Chains**: Supervisor recommendation $\rightarrow$ HR authorization with full audit logs.

### 7. Kenyan Statutory & Global Payroll Engine
- **Full Kenyan Statutory Compliance**:
  - **KRA PAYE**: Current graduated tax bands with automatic relief deductions:
    * Standard Personal Relief (KES 2,400/month)
    * Insurance Relief (15% up to KES 5,000/month)
    * PWD Tax Exemption (Exempt up to KES 150,000/month with statutory exemption certificates)
  - **NSSF Pension**: Tier I (up to KES 8,000) and Tier II (KES 8,001 to KES 72,000) employer/employee contributions.
  - **SHIF (Social Health Insurance Fund)**: 2.75% of gross earnings with statutory floor limits.
  - **Affordable Housing Levy (AHL)**: 1.5% employee deduction + 1.5% employer match.
  - **NITA Levy**: Industrial training statutory deductions.
- **Multi-Pipeline Execution**: Separate payroll runs for Monthly Permanent Staff, Weekly Casuals, and Contract piece-rate earners.
- **Disbursement Engines**: Bank EFT direct credit export and M-Pesa B2C batch disbursement payloads.
- **Automated General Ledger Posting**: Automatic journal creation mapping Net Pay, Tax Payables, and Statutory Liabilities to Finance GL.

### 8. Performance Management & Appraisals
- **Objective & KPI Tracking**: Cascading departmental goals to individual target scorecards.
- **Periodic Appraisal Cycles**: Quarterly, semi-annual, and annual 360-degree review evaluations.
- **Performance Improvement Plans (PIP)**: Structured milestones with automatic notification triggers.

### 9. Training, Certifications & Skills Matrix
- **Skills Gap Analysis**: Departmental competency audits mapped against job descriptions.
- **Course Administration**: Internal workshops, certified technical training, and CPD credit logging.
- **Bonding & Agreements**: Training cost amortizations with service commitment thresholds.

### 10. Disciplinary & Labor Law Compliance (Sec 37)
- **Employment Act Section 37 Compliance**: Built-in statutory monitoring for casual and non-standard contracts to prevent unlawful long-term casualization.
- **Disciplinary Case Files**: Show-cause letters, formal explanations, panel hearing minutes, and progressive disciplinary actions (Verbal $\rightarrow$ Written $\rightarrow$ Final Warning).
- **Appeals & Labor Relations**: Trade union dispute logs and conciliation tracking.

### 11. OSH, DOSHS Compliance & High-Risk Permits
- **Safety Permits to Work (PTW)**: High-risk permit authorizations for Hot Work (Welding), Confined Space Entry, Hazardous Chemical Handling, and High-Voltage Maintenance.
- **DOSHS Form 1 & Regulatory Registers**: Workplace statutory certifications, incident registers, and injury logs.
- **PPE & Hazard Audits**: Routine safety walk checklists and mitigation tracking.

### 12. Separation, Exit Clearances & Statutory P9
- **Multi-Department Clearance Matrix**: Strict handovers across Stores (tools/keys), ICT (credentials/hardware), Finance (advances/loans), and HR.
- **Terminal Dues Calculation**: Automatic encashment of untaken leave, notice pay, severance, and gratuity calculations.
- **Statutory P9 Tax Forms**: Year-to-date and terminal P9 certificate generation for employee KRA returns.

---

## 📱 Employee Self-Service (ESS) Portal

Designed for mobile and desktop access, empowering every worker:
- **Digital Payslips**: Instant view and PDF download of monthly pay slips with complete breakdowns of earnings, reliefs, and deductions.
- **Leave Application**: Live balance inquiry, calendar availability check, document attachment, and status tracking.
- **Clock In / Out**: Web and geofenced attendance punches with work log confirmation.
- **Expense Claims & Imprests**: Travel and operational expense submissions with receipt uploads.

---

## 💰 Financial Management Suite

A full-fledged ERP accounting engine that enforces strict double-entry integrity:

- **General Ledger & Chart of Accounts (COA)**: Hierarchical account tree (Assets, Liabilities, Equity, Revenue, Cost of Sales, Operating Expenses) with multi-currency support.
- **Accounts Receivable (AR)**: Customer directory, credit terms, sales invoices, credit notes, aged debtor analysis, and customer receipts.
- **Accounts Payable (AP)**: Supplier master, bill capture, matching with purchase orders, approval pipelines, and remittance advices.
- **Cash & Bank Reconciliation**: Multi-account management, statement import, auto-matching rules, and bank reconciliation adjustments.
- **Fixed Asset Registry**: Asset acquisition, depreciation runs (Straight Line, Reducing Balance), and disposal journals.
- **Budgets & Planning**: Cost center budgeting, actual vs. budget variance tracking, and forecast models.
- **Month-End Close**: Checklist-driven period closing with automated lockouts preventing backdated postings.
- **Financial Statements**:
  - Trial Balance (Live balancing debit/credit validation)
  - Statement of Comprehensive Income (Profit & Loss)
  - Statement of Financial Position (Balance Sheet)
  - Cash Flow Statement (Direct & Indirect methods)

---

## 📦 Commercial & Supply Chain Suite

### Trading & Sales Fulfilment
- **Sales Quotations**: Line-item pricing, tax calculations, customer discounts, and validity periods.
- **Sales Orders & Booking**: Order confirmation, credit-limit checks, and stock reservation.
- **Deliveries & Dispatch**: Picking lists, dispatch notes, carrier assignment, and delivery confirmations.
- **Product & Price Catalogs**: Tiered pricing, customer-specific price lists, and margin monitoring.

### Procurement & Purchasing
- **Purchase Requisitions**: Departmental demand requests tied directly to budget lines.
- **Request for Quotation (RFQ) & Sourcing**: Vendor price comparison, quote matrices, and award decisions.
- **Purchase Orders (PO)**: Automated generation, supplier dispatch, and delivery date tracking.
- **Goods Received Notes (GRN)**: Quality inspection at the dock, warehouse allocation, and supplier bill matching (3-Way Matching).

### Business Development & Pipeline
- **Deal Stages**: Lead $\rightarrow$ Qualification $\rightarrow$ Proposal $\rightarrow$ Negotiation $\rightarrow$ Won/Lost.
- **Value Weighted Forecasting**: Pipeline velocity, deal sizes, win probabilities, and sales rep performance.

---

## 🏭 Operations & Logistics Suite

### Warehousing & Stock Movements
- **Multi-Location Inventory**: Multiple warehouses, physical bins, zones, and bonded storage.
- **Stock Transfers**: Inter-warehouse transfer requests, dispatch, transit monitoring, and receiving verification.
- **Cycle Counts & Stock Takes**: Periodic physical count entry, variance reconciliation, and automated stock adjustment journals.
- **Min/Max Reorder Alerts**: Automated notifications when items breach minimum safety stock thresholds.

### Production & Manufacturing
- **Bills of Materials (BOM)**: Multi-level BOM trees defining raw materials, sub-assemblies, and labor costs.
- **Work Orders**: Production job release, material requisitions, WIP tracking, and yield reporting.
- **Output & Scrap Tracking**: Real-time logging of acceptable units and scrap percentage.

### Shipping & Freight
- **Shipment Management**: Waybills, delivery runs, transport manifest generation, and proof-of-delivery (POD) tracking.
- **Freight Cost Tracking**: Route optimization, fuel surcharges, and carrier invoices.

### Fleet Management & Maintenance
- **Vehicle Registry**: Asset registration, odometer logs, inspection dates, and driver assignments.
- **Fuel & Telematics Logs**: Consumption monitoring, mileage metrics, and expense reconciliation.
- **Plant & Equipment Maintenance**:
  - Preventive Maintenance Schedules (Time-based & meter-based triggers)
  - Corrective Work Orders (Breakdown triage, spare part issue, downtime logs)

---

## 🛡️ Governance, Control & Quality Suite

- **Quality Assurance & Audits**: Non-conformance reports (NCR), CAPA (Corrective and Preventive Actions), and batch inspection checklists.
- **ICT Systems & Assets**: Equipment inventory, internal IT support tickets, network service monitors, and credential tracking.
- **Integrations Hub**: Webhooks, external API connectors (Payment gateways, KRA eTIMS, Biometric hardware sync, Cloud storage).
- **Corporate Governance & Risk**: Enterprise risk register, internal audit findings, policy repository, and board oversight trackers.

---

## 📊 Executive Intelligence & Unified Approvals Hub

- **Unified Approvals Inbox**: One consolidated dashboard where executives and managers can review pending items across Requisitions, Purchase Orders, Expenses, Leave, and Journal Entries.
- **Executive Analytics Dashboard**:
  - Live revenue, gross margin, and operating profit charts
  - Working capital, burn rate, and cash runway projections
  - Headcount growth, payroll expenditure, and statutory compliance status
  - Operations capacity utilization and fulfillment rates

---

## 🔐 Enterprise Platform Administration & Security

- **Role-Based Access Control (RBAC)**: Domain-level permission matrix (Read, Write, Delete, Admin) across Super Admin, Org Admin, Finance Manager, HR Officer, Operations Lead, and Auditor roles.
- **Security & MFA**: FIDO2 and TOTP multi-factor authentication enforcement, active session viewer, and remote session termination.
- **Comprehensive Audit Logs**: Immutable recording of every actor, IP address, timestamp, affected resource, and pre/post entity states.
- **System Health Monitor**: Latency tracking (P95/P99), error budgets, service node status, and background sync worker health.
- **AI Insights Engine**: Continuous background anomaly detection flagging budget drifts, duplicate invoices, biometric spoofing, and inventory variances.

---

## 🏢 Multi-Tenant Organization Setup

Integrated ERP supports complex corporate structures:
- **Holding Companies & Subsidiaries**: Manage parent companies alongside manufacturing plants, agricultural estates, and sales branches.
- **Company Setup Module**:
  - Legal business name, branding color tokens, and logo uploads
  - Statutory numbers: KRA PIN, Business Registration, NSSF Employer No, SHIF Employer No, Housing Levy No, NITA No
  - Financial Year configurations (Calendar Year vs. custom fiscal start months)
  - Configurable payroll cut-off days and disbursement dates
  - Department and designation org charts

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Core Framework** | [React 19](https://react.dev/) + [TypeScript 6](https://www.typescriptlang.org/) |
| **Build Tool & Dev Server** | [Vite 8](https://vitejs.dev/) |
| **Icons & Design Language** | [Lucide React](https://lucide.dev/), Modern Glassmorphic Design System |
| **State Management** | Context API + Modular Dedicated Suite Stores (`FinanceProvider`, `CommercialProvider`, `OperationsProvider`, etc.) |
| **Linter & Code Quality** | [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) |
| **Containerization** | Docker + Multi-stage Nginx Static Container |

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (Node 20+ recommended)
- **npm** or **pnpm** / **yarn**
- **Git**

### Installation & Local Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/adudajeff/IntergratedERP.git
   cd IntergratedERP
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173`.

### Building for Production

Compile TypeScript and build the optimized production bundle:
```bash
npm run build
```
To preview the production bundle locally:
```bash
npm run preview
```

### Docker Deployment

Build and run the containerized application:
```bash
# Build the Docker image
npm run docker:build

# Run on port 8080
npm run docker:run

# Stop the container
npm run docker:stop
```

---

## 📁 Project Directory Structure

```
d:/ieui/
├── public/                 # Static assets, branding, and icons
├── src/
│   ├── assets/             # Graphics, styles, and shared SVGs
│   ├── components/         # Reusable design system components
│   │   ├── common/         # Command palette, modals, toasts, cards
│   │   ├── digicraft/      # DigiCraft app launchpad & guided AI tour
│   │   ├── drawers/        # Slide-over drawers (AI Assistant, actions, details)
│   │   └── shell/          # Top navigation header, module sidebar, launchers
│   ├── context/            # Global AppContext (tenant switching, current view, UI state)
│   ├── data/               # Seed datasets, statutory defaults, mock workflows
│   ├── suites/             # Independent Enterprise Business Suites:
│   │   ├── commercial/     # Trading, RFQ sourcing, Procurement, BizDev
│   │   ├── control/        # Quality, ICT, Integrations Hub, Governance
│   │   ├── finance/        # GL, AR/AP, Invoices, Bank Rec, Budgets, Assets, Close
│   │   ├── hub/            # Approvals Suite & Executive Dashboard
│   │   ├── operations/     # Warehousing, Production BOM, Shipping, Fleet, Maintenance
│   │   └── ui/             # Reusable suite design kit (Stats, Meters, Timelines)
│   ├── types/              # Domain TypeScript interfaces and types
│   ├── utils/              # Calculation helpers, guide steps, formatters
│   ├── views/              # Core Platform & HR Process Application Views:
│   │   ├── ess/            # Employee Self-Service Portal
│   │   ├── hr/             # 12-Stage HCM Lifecycle Views (Payroll, Leave, Requisition...)
│   │   └── ...             # Settings, RBAC Roles, System Health, Audit Logs
│   ├── App.tsx             # Root Application view routing and provider wrappers
│   ├── index.css           # Global CSS variables, modern dark/light themes
│   └── main.tsx            # React 19 bootstrap entry point
├── Dockerfile              # Production Docker build definition
├── package.json            # Scripts, dependencies, and project metadata
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite configuration
```

---

## 📄 License

This software is proprietary and confidential.  
Copyright © 2026 **Jeff Aduda / Integrated ERP**. All Rights Reserved.
