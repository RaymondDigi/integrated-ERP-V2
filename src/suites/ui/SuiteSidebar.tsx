import React from 'react';
import { LayoutGrid, ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface SuiteNavItem<P extends string> {
  id: P;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeTone?: 'warning' | 'critical' | 'neutral';
}

export interface SuiteNavGroup<P extends string> {
  label: string;
  items: SuiteNavItem<P>[];
}

/** Sidebar shared by every module suite (Finance, Procurement, …). */
export const SuiteSidebar = <P extends string>({
  name,
  tagline,
  icon: Icon,
  groups,
  active,
  onSelect,
  footer
}: {
  name: string;
  tagline: string;
  icon: LucideIcon;
  groups: SuiteNavGroup<P>[];
  active: P;
  onSelect: (page: P) => void;
  footer?: React.ReactNode;
}) => {
  const { isSidebarCollapsed: collapsed, toggleSidebar, isMobileMenuOpen, closeMobileMenu, setIsLauncherOpen } = useApp();
  const select = (p: P) => {
    onSelect(p);
    closeMobileMenu();
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  };
  return (
    <>
      {isMobileMenuOpen && <div className="mobile-nav-backdrop" onClick={closeMobileMenu} aria-hidden="true" />}
      <aside className={`app-sidebar sx-sidebar ${collapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`} aria-label={`${name} navigation`}>
        <div className="sx-side-head">
          <span className="sx-side-icon">
            <Icon size={18} />
          </span>
          {!collapsed && (
            <div>
              <strong>{name}</strong>
              <small>{tagline}</small>
            </div>
          )}
        </div>
        <nav className="sx-side-nav">
          {groups.map((g) => (
            <div key={g.label} className="sx-side-group">
              {!collapsed && <span className="sx-side-label">{g.label}</span>}
              {g.items.map((it) => {
                const ItemIcon = it.icon;
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={`sx-side-item ${active === it.id ? 'active' : ''}`}
                    onClick={() => select(it.id)}
                    title={collapsed ? it.label : undefined}
                    aria-current={active === it.id ? 'page' : undefined}
                  >
                    <ItemIcon size={16} />
                    {!collapsed && <span>{it.label}</span>}
                    {!!it.badge && <em className={`sx-side-badge ${it.badgeTone ?? 'warning'}`}>{it.badge}</em>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {!collapsed && footer}
        <div className="sx-side-foot">
          <button type="button" className="sx-side-item" onClick={() => setIsLauncherOpen(true)} title="Switch module">
            <LayoutGrid size={16} />
            {!collapsed && <span>Switch module</span>}
          </button>
          <button type="button" className="sx-side-item sx-side-collapse" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
