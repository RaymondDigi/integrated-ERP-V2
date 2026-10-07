import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  X,
  Search,
  Sparkles,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  ShieldCheck,
  Settings,
  LogOut,
  LayoutGrid,
  ChevronRight,
  Home,
  UserCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { HR_PROCESS_APPS } from '../../data/hrMockData';
import { BrandLogo } from './BrandLogo';
import { ROLE_LABEL, signOut, useSession } from '../../auth/session';
import { FinanceCrumb } from '../../suites/finance/FinanceSuite';
import { TradingCrumb } from '../../suites/commercial/trading/TradingSuite';
import { ProcurementCrumb } from '../../suites/commercial/procurement/ProcurementSuite';
import { BizDevCrumb } from '../../suites/commercial/bizdev/BizDev';
import { WarehousingCrumb } from '../../suites/operations/Warehousing';
import { ProductionCrumb } from '../../suites/operations/Production';
import { ShippingCrumb } from '../../suites/operations/Shipping';
import { FleetCrumb } from '../../suites/operations/Fleet';
import { MaintenanceCrumb } from '../../suites/operations/Maintenance';
import { QualityCrumb } from '../../suites/control/Quality';
import { IctCrumb } from '../../suites/control/Ict';
import { GovernanceCrumb } from '../../suites/control/Governance';
import { ApprovalsCrumb } from '../../suites/hub/Approvals';
import { ExecutiveCrumb } from '../../suites/hub/Executive';

export const Header: React.FC = () => {
  const session = useSession();
  const {
    currentView,
    setCurrentView,
    selectedOrgId,
    setSelectedOrgId,
    tenantOrganizations,
    theme,
    toggleTheme,
    isMobileMenuOpen,
    toggleMobileMenu,
    setIsCommandPaletteOpen,
    setIsAiDrawerOpen,
    isLauncherOpen,
    setIsLauncherOpen,
    addToast
  } = useApp();

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [, setIsAppMenuOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (appMenuRef.current && !appMenuRef.current.contains(e.target as Node)) {
        setIsAppMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentAppMeta = HR_PROCESS_APPS.find((app) => app.id === currentView);

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Mobile menu toggle */}
        <button
          className="mobile-menu-btn"
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
          title={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
        >
          {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* DigiCraft 9-Dot Waffle Icon */}
        <div style={{ position: 'relative' }} ref={appMenuRef}>
          <button
            className={`digicraft-waffle-btn ${isLauncherOpen ? 'active' : ''}`}
            onClick={() => setIsLauncherOpen(true)}
            title="Switch module — Finance, People & Payroll and more"
            aria-label="Open module launcher"
          >
            <LayoutGrid size={18} />
          </button>
        </div>

        {/* Brand Logo */}
        <button
          type="button"
          className="header-logo"
          onClick={() => setCurrentView('apps')}
          title="Integrated Workforce — return to Apps Launcher"
        >
          <BrandLogo size="sm" />
        </button>

        {/* Breadcrumb Navigation */}
        <div className="header-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
          <ChevronRight size={13} />
          {currentView === 'apps' ? (
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Apps Launcher</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setCurrentView('apps')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--brand-primary)',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <Home size={12} />
                Apps
              </button>
              <ChevronRight size={11} />
              {currentView === 'finance' ? (
                <FinanceCrumb />
              ) : currentView === 'trading' ? (
                <TradingCrumb />
              ) : currentView === 'procurement' ? (
                <ProcurementCrumb />
              ) : currentView === 'bizdev' ? (
                <BizDevCrumb />
              ) : currentView === 'warehousing' ? (
                <WarehousingCrumb />
              ) : currentView === 'production' ? (
                <ProductionCrumb />
              ) : currentView === 'shipping' ? (
                <ShippingCrumb />
              ) : currentView === 'fleet' ? (
                <FleetCrumb />
              ) : currentView === 'maintenance' ? (
                <MaintenanceCrumb />
              ) : currentView === 'quality' ? (
                <QualityCrumb />
              ) : currentView === 'ict' ? (
                <IctCrumb />
              ) : currentView === 'governance' ? (
                <GovernanceCrumb />
              ) : currentView === 'approvals' ? (
                <ApprovalsCrumb />
              ) : currentView === 'executive' ? (
                <ExecutiveCrumb />
              ) : currentView === 'integrations-hub' || currentView === 'implementation' ? (
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{currentView === 'implementation' ? 'Implementation Hub' : 'Integrations'}</span>
              ) : (
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {currentAppMeta ? currentAppMeta.name : currentView === 'ess' ? 'Employee Portal' : currentView === 'org-setup' ? 'Company Setup' : currentView}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Multi-Tenant Company Switcher */}
        <div style={{ position: 'relative', marginLeft: 8 }}>
          <select
            className="org-selector"
            value={selectedOrgId}
            onChange={(e) => {
              const newOrgId = e.target.value;
              setSelectedOrgId(newOrgId);
              const org = tenantOrganizations.find((t) => t.id === newOrgId);
              addToast({
                type: 'info',
                title: 'Operational Entity Switched',
                message: `Active tenant scope changed to ${org?.name || newOrgId}.`
              });
            }}
            aria-label="Select operating company"
          >
            {tenantOrganizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.settings?.displayName || org.name} ({org.code})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={`header-icon-btn ${currentView === 'org-setup' ? 'active' : ''}`}
          onClick={() => setCurrentView('org-setup')}
          title="Company setup — create and edit companies"
          aria-label="Open company setup"
        >
          <Building2 size={16} />
        </button>
      </div>

      <div className="header-right">
        {/* Kenyan Statutory 2026 Engine Status Pill */}
        <div
          className="header-compliance-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '3px 10px',
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 600
          }}
          title="Compliant with current PAYE, NSSF, SHIF and Housing Levy rules"
        >
          <ShieldCheck size={14} color="#059669" />
          <span className="header-compliance-text">Statutory 2026 Compliant</span>
        </div>

        {/* Universal Search (Cmd+K) */}
        <button
          className="header-search-btn"
          onClick={() => setIsCommandPaletteOpen(true)}
          aria-label="Open Command Palette"
        >
          <Search size={14} />
          <span>Search or jump to...</span>
          <kbd>/</kbd>
        </button>

        {/* Employee Self-Service Portal */}
        <button
          className={`header-icon-btn header-ess-btn ${currentView === 'ess' ? 'active' : ''}`}
          onClick={() => setCurrentView('ess')}
          title="My Employee Portal (Self-Service)"
          aria-label="Open my Employee Self-Service portal"
        >
          <UserCircle size={16} />
          <span>My Portal</span>
        </button>

        {/* AI Pre-Flight Diagnostics */}
        <button
          className="header-icon-btn"
          onClick={() => setIsAiDrawerOpen(true)}
          title="AI Pre-Flight Anomaly Diagnostics (Self-Healing Checks)"
          aria-label="Open AI Pre-Flight Diagnostics"
        >
          <Sparkles size={16} color="var(--brand-primary)" />
        </button>

        {/* Theme Toggle (Light / Dark) */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* User Profile Dropdown */}
        <div className="profile-dropdown-wrapper" ref={profileDropdownRef} style={{ position: 'relative' }}>
          <button
            className="profile-btn"
            onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
            aria-expanded={isProfileDropdownOpen}
            aria-label="Open User Profile menu"
          >
            <div className="avatar-img-wrapper" style={{ background: '#237857', color: '#fff', fontWeight: 700 }}>
              {session?.initials ?? 'JK'}
            </div>
            <div className="profile-info">
              <span className="profile-name">{session?.name ?? 'Joseph Kiprono'}</span>
              <span className="profile-role">{session?.title ?? 'HR & Payroll Controller'}</span>
            </div>
            <ChevronDown size={14} className="profile-chevron" />
          </button>

          {isProfileDropdownOpen && (
            <div
              className="dropdown-menu profile-menu"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                zIndex: 100,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                minWidth: 220,
                padding: '4px 0'
              }}
            >
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{session?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{session?.email}</div>
                <div style={{ fontSize: 10, color: 'var(--brand-primary)', fontWeight: 600, marginTop: 2 }}>
                  {session ? ROLE_LABEL[session.role] : ''}
                </div>
                {session && (
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Signed in {new Date(session.signedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · session ends{' '}
                    {new Date(session.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              <button
                className="dropdown-item"
                onClick={() => {
                  setCurrentView('ess');
                  setIsProfileDropdownOpen(false);
                }}
              >
                <UserCircle size={14} />
                <span>My Employee Portal (ESS)</span>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setCurrentView('apps');
                  setIsProfileDropdownOpen(false);
                }}
              >
                <LayoutGrid size={14} />
                <span>DigiCraft Apps Launchpad</span>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setCurrentView('payroll');
                  setIsProfileDropdownOpen(false);
                }}
              >
                <Building2 size={14} />
                <span>Employee Payroll Console</span>
              </button>

              <button
                className="dropdown-item"
                onClick={() => {
                  setCurrentView('settings');
                  setIsProfileDropdownOpen(false);
                }}
              >
                <Settings size={14} />
                <span>Statutory Settings & Tax Bands</span>
              </button>

              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

              <button
                className="dropdown-item text-critical"
                onClick={() => {
                  setIsProfileDropdownOpen(false);
                  setCurrentView('apps');
                  setIsLauncherOpen(true);
                  signOut();
                }}
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
