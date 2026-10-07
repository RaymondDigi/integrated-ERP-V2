import type { NavigationTarget } from '../context/AppContext';

/** Base address of the Integrated ERP workspace; set VITE_ERP_URL to point elsewhere. */
export const ERP_URL = (import.meta.env.VITE_ERP_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:3000';

export type LauncherIcon =
  | 'LayoutDashboard'
  | 'ChartNoAxesCombined'
  | 'CheckCheck'
  | 'GitPullRequest'
  | 'TrendingUp'
  | 'ShoppingCart'
  | 'Handshake'
  | 'Warehouse'
  | 'Blend'
  | 'Ship'
  | 'Truck'
  | 'Wrench'
  | 'ShieldCheck'
  | 'Users'
  | 'Landmark'
  | 'MonitorCog'
  | 'Plug'
  | 'Layers'
  | 'ClipboardCheck';

export interface LauncherModule {
  id: string;
  name: string;
  description: string;
  icon: LauncherIcon;
  color: string;
  /** Path in the ERP workspace, used until the module is built into this app. */
  path: string | null;
  /** Screen inside this app that opens the module. */
  view?: NavigationTarget;
  /** Page inside that screen, for screens with more than one entry point. */
  page?: string;
}

export interface LauncherGroup {
  name: string;
  modules: LauncherModule[];
}


/** Every workspace, grouped as in the Integrated ERP sidebar. */
export const LAUNCHER_GROUPS: LauncherGroup[] = [
  {
    name: 'People & assurance',
    modules: [
      { id: 'hcm', name: 'People & Payroll', description: 'Employees, leave, payroll, P9 and self-service', icon: 'Users', color: '#237857', path: null, view: 'apps' },
      { id: 'qa', name: 'Quality & Risk', description: 'Audits, corrective actions, risks and complaints', icon: 'ShieldCheck', color: '#709774', path: null, view: 'quality' }
    ]
  },
  {
    name: 'Finance & systems',
    modules: [
      { id: 'finance', name: 'Finance', description: 'Invoices, budgets, treasury, assets and journals', icon: 'Landmark', color: '#4e8d8c', path: null, view: 'finance' },
      { id: 'ict', name: 'ICT Service Desk', description: 'Tickets, IT assets, changes and access reviews', icon: 'MonitorCog', color: '#647ac2', path: null, view: 'ict' },
      { id: 'integrations', name: 'Integrations', description: 'External platforms, devices and data exchanges', icon: 'Plug', color: '#7f8f9c', path: null, view: 'integrations-hub' }
    ]
  },
  {
    name: 'Commercial',
    modules: [
      { id: 'trading', name: 'Trading & Sales', description: 'Orders, quotations, pricing and sales contracts', icon: 'TrendingUp', color: '#16866b', path: null, view: 'trading' },
      { id: 'procurement', name: 'Procurement', description: 'Sourcing, suppliers, purchase orders and invoices', icon: 'ShoppingCart', color: '#d98a36', path: null, view: 'procurement' },
      { id: 'business-development', name: 'Business Development', description: 'Opportunities, onboarding and client feedback', icon: 'Handshake', color: '#8d6dc4', path: null, view: 'bizdev' }
    ]
  },
  {
    name: 'Operations',
    modules: [
      { id: 'warehousing', name: 'Warehousing', description: 'Stock, locations, movements and cycle counts', icon: 'Warehouse', color: '#3c9f9a', path: null, view: 'warehousing' },
      { id: 'blending', name: 'Blending & Production', description: 'Blends, production batches and out-turn', icon: 'Blend', color: '#728448', path: null, view: 'production' },
      { id: 'shipping', name: 'Shipping & Exports', description: 'Shipping instructions through to departure', icon: 'Ship', color: '#448bb4', path: null, view: 'shipping' },
      { id: 'transport', name: 'Transport & Fleet', description: 'Vehicles, deliveries and fleet maintenance', icon: 'Truck', color: '#cf8845', path: null, view: 'fleet' },
      { id: 'technical', name: 'Maintenance & Projects', description: 'Work orders, preventive maintenance, projects', icon: 'Wrench', color: '#b47752', path: null, view: 'maintenance' }
    ]
  },
  {
    name: 'Workspace',
    modules: [
      { id: 'overview', name: 'Business Overview', description: 'The big picture across every module', icon: 'LayoutDashboard', color: '#153e33', path: null, view: 'executive', page: 'overview' },
      { id: 'analytics', name: 'Analytics', description: 'Performance, comparisons and what-if models', icon: 'ChartNoAxesCombined', color: '#16866b', path: null, view: 'executive', page: 'analytics' },
      { id: 'approvals', name: 'Approval Center', description: 'Everything waiting for a decision', icon: 'CheckCheck', color: '#b2985c', path: null, view: 'approvals', page: 'inbox' },
      { id: 'workflows', name: 'Workflows', description: 'Approvals, knowledge and document reviews', icon: 'GitPullRequest', color: '#679b78', path: null, view: 'approvals', page: 'rules' }
    ]
  },
  {
    name: 'Administration',
    modules: [
      { id: 'implementation', name: 'Implementation Hub', description: 'Implementation and vendor information', icon: 'Layers', color: '#718279', path: null, view: 'implementation' },
      { id: 'governance', name: 'Governance & Compliance', description: 'Security, safety, welfare and permits', icon: 'ClipboardCheck', color: '#8d855e', path: null, view: 'governance' }
    ]
  }
];
