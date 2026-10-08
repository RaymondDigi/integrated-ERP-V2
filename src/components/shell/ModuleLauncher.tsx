import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  ArrowUpRight,
  LayoutDashboard,
  ChartNoAxesCombined,
  CheckCheck,
  GitPullRequest,
  TrendingUp,
  ShoppingCart,
  Handshake,
  Warehouse,
  Blend,
  Ship,
  Truck,
  Wrench,
  ShieldCheck,
  Users,
  Landmark,
  MonitorCog,
  Plug,
  Layers,
  ClipboardCheck,
  type LucideIcon
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ERP_URL, LAUNCHER_GROUPS, type LauncherIcon, type LauncherModule } from '../../data/erpModules';
import { BrandMark } from './BrandLogo';
import { canOpen, useAccessMatrix } from '../../platform/rbac';
import { useSession } from '../../auth/session';
import { useHub, type ExecutivePage, type WorkflowsPage } from '../../suites/hub/store';

const ICONS: Record<LauncherIcon, LucideIcon> = {
  LayoutDashboard,
  ChartNoAxesCombined,
  CheckCheck,
  GitPullRequest,
  TrendingUp,
  ShoppingCart,
  Handshake,
  Warehouse,
  Blend,
  Ship,
  Truck,
  Wrench,
  ShieldCheck,
  Users,
  Landmark,
  MonitorCog,
  Plug,
  Layers,
  ClipboardCheck
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Floating module launcher: People & Payroll opens here, every other module opens in the ERP. */
export const ModuleLauncher: React.FC = () => {
  const { isLauncherOpen, setIsLauncherOpen, currentView, setCurrentView } = useApp();
  const hub = useHub();
  // Which in-app module is open now; anything that is not a module suite belongs to People & Payroll
  const inApp = LAUNCHER_GROUPS.flatMap((g) => g.modules).filter((m) => m.view && m.view !== 'apps');
  const current = inApp.find((m) => m.view === currentView);
  const here = current?.id ?? 'hcm';
  const hereName = current?.name ?? 'People & Payroll';
  const HereIcon = current ? ICONS[current.icon] : Users;
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setIsLauncherOpen(false);

  useEffect(() => {
    if (!isLauncherOpen) return;
    setQuery('');
    const previous = document.activeElement as HTMLElement | null;
    // Focus the current module's tile so Enter simply continues
    requestAnimationFrame(() => (panelRef.current?.querySelector<HTMLElement>('.ml-tile-home') ?? panelRef.current?.querySelector<HTMLElement>('.ml-tile'))?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsLauncherOpen(false);
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button, input')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [isLauncherOpen, setIsLauncherOpen]);

  // The menu is tailored to the signed-in role: modules the role cannot open are left out
  const role = useSession()?.role;
  const matrix = useAccessMatrix();
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LAUNCHER_GROUPS.map((g) => ({
      ...g,
      modules: g.modules.filter((m) => (!m.view || canOpen(role, m.view)) && (!q || `${m.name} ${m.description} ${g.name}`.toLowerCase().includes(q)))
    })).filter((g) => g.modules.length);
    // matrix is read through canOpen(); listed so the menu updates when access changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, role, matrix]);

  if (!isLauncherOpen) return null;

  const openView = (m: LauncherModule) => {
    if (m.view === 'executive' && m.page) hub.setExecutive(m.page as ExecutivePage);
    if (m.view === 'approvals' && m.page) hub.setWorkflows(m.page as WorkflowsPage);
    if (m.id !== here) setCurrentView(m.view!);
    close();
  };

  const tile = (m: LauncherModule, index: number) => {
    const Icon = ICONS[m.icon];
    const style = { '--ml-color': m.color, animationDelay: `${Math.min(index, 14) * 22}ms` } as React.CSSProperties;
    const body = (
      <>
        <span className="ml-orb">
          <Icon size={24} strokeWidth={1.7} />
        </span>
        <span className="ml-name">{m.name}</span>
        <span className="ml-desc">{m.description}</span>
        {m.id === here ? <span className="ml-here">You are here</span> : !m.view && <ArrowUpRight size={13} className="ml-out" aria-hidden="true" />}
      </>
    );
    return m.view ? (
      <button key={m.id} type="button" className={`ml-tile ${m.id === here ? 'ml-tile-home' : ''}`} style={style} onClick={() => openView(m)}>
        {body}
      </button>
    ) : (
      <a key={m.id} className="ml-tile" style={style} href={ERP_URL + m.path} title={`Open ${m.name} in the ERP workspace`}>
        {body}
      </a>
    );
  };

  let index = 0;
  return (
    <div className="ml-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="ml-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ml-title">
        <header className="ml-head">
          <BrandMark size={40} />
          <div className="ml-head-text">
            <span className="ml-eyebrow">{greeting()}</span>
            <h2 id="ml-title">Where would you like to work today?</h2>
          </div>
          <button type="button" className="ml-close" onClick={close} aria-label="Close module launcher">
            <X size={18} />
          </button>
        </header>

        <label className="ml-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a module…" aria-label="Find a module" />
        </label>

        <div className="ml-body">
          {groups.length === 0 && <p className="ml-empty">No module matches “{query}”.</p>}
          {groups.map((g) => (
            <section key={g.name} className="ml-group">
              <h3>{g.name}</h3>
              <div className="ml-grid">{g.modules.map((m) => tile(m, index++))}</div>
            </section>
          ))}
        </div>

        <footer className="ml-foot">
          <span>
            Press <kbd>Esc</kbd> or click outside to stay in {hereName}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={close}>
            <HereIcon size={14} /> Continue to {hereName}
          </button>
        </footer>
      </div>
    </div>
  );
};
