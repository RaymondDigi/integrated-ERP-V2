import React, { useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Eye, EyeOff, KeyRound, Layers, LoaderCircle, Moon, ShieldCheck, Sun } from 'lucide-react';
import { BrandLogo } from '../../components/shell/BrandLogo';
import { useApp } from '../../context/AppContext';
import { ACCOUNTS, DEMO_MFA_CODE, DEMO_PASSWORD, ROLE_LABEL, signIn } from '../../auth/session';

const MODULES = ['People & Payroll', 'Finance', 'Trading', 'Operations', 'Quality', 'Governance'];

/** The animated "connected operations" panel on the story side. */
const OperationsGraphic: React.FC = () => (
  <div className="lg-visual" role="img" aria-label="Animated illustration of connected people, finance and operations modules.">
    <div className="lg-visual-top" aria-hidden="true">
      <span>
        <i />
        One workspace, every module
      </span>
      <Layers size={18} />
    </div>
    <div className="lg-network" aria-hidden="true">
      <span>People</span>
      <i />
      <span>Payroll</span>
      <i />
      <span>Finance</span>
    </div>
    <div className="lg-bars" aria-hidden="true">
      {[30, 42, 38, 62, 51, 71, 59, 83, 70, 94, 86, 100].map((v, i) => (
        <i key={i} style={{ height: `${v}%`, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
    <div className="lg-visual-footer" aria-hidden="true">
      <span>{MODULES.join(' · ')}</span>
      <ArrowUpRight size={16} />
    </div>
  </div>
);

export const LoginView: React.FC = () => {
  const { setCurrentView, setIsLauncherOpen, theme, toggleTheme } = useApp();
  const [email, setEmail] = useState('admin@integrated.local');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError('');
    // A short pause so it feels like the real round trip
    setTimeout(() => {
      const r = signIn(email, password, code, remember);
      if (!r.ok) {
        if (r.mfaRequired) setMfa(true);
        setError(r.attemptsLeft !== undefined && r.attemptsLeft <= 2 && r.attemptsLeft > 0 ? `${r.error}. ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left before a 15-minute lock.` : r.error);
        setBusy(false);
        return;
      }
      setCurrentView(r.account.landing);
      // Staff land on the module launcher; the portal account goes straight to self-service
      setIsLauncherOpen(r.account.landing === 'apps');
    }, 450);
  };

  const pick = (e: string) => {
    setEmail(e);
    setPassword(DEMO_PASSWORD);
    setCode('');
    setMfa(false);
    setError('');
    setDemoOpen(false);
  };

  return (
    <main className="lg-page">
      <button className="lg-theme" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="lg-layout">
        <section className="lg-story" aria-labelledby="lg-story-title">
          <BrandLogo size="md" onDark />
          <div className="lg-story-content">
            <div className="lg-eyebrow">CONNECTED TEA OPERATIONS</div>
            <h1 id="lg-story-title">
              Every operation.
              <br />
              <span>One shared view.</span>
            </h1>
            <p>From hiring and payroll to the final shipment — one sign-in gives each team the modules it works in, with the same people, numbers and approvals everywhere.</p>
            <OperationsGraphic />
          </div>
          <div className="lg-story-footer">
            <span>Built around your business.</span>
            <span>Ready to grow with it.</span>
          </div>
        </section>

        <section className="lg-form-side" aria-labelledby="lg-form-title">
          <div className="lg-form">
            <div className="lg-mobile-brand">
              <BrandLogo size="md" />
            </div>
            <div className="lg-access">
              <span />
              YOUR WORKSPACE AWAITS
            </div>
            <h2 id="lg-form-title">Welcome back</h2>
            <p className="lg-lead">Sign in to your Integrated workspace.</p>

            <form onSubmit={submit} aria-busy={busy} noValidate>
              <label className="lg-field">
                <span>Email address</span>
                <input
                  className="form-control"
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(ev) => {
                    setEmail(ev.target.value);
                    setMfa(false);
                  }}
                  required
                  disabled={busy}
                />
              </label>
              <label className="lg-field">
                <span>Password</span>
                <div className="lg-password">
                  <input
                    className="form-control"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    placeholder="Enter your password"
                    required
                    disabled={busy}
                  />
                  <button type="button" className="lg-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {mfa && (
                <label className="lg-field">
                  <span>Authenticator code</span>
                  <input
                    className="form-control lg-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    value={code}
                    onChange={(ev) => setCode(ev.target.value.replace(/[^\d ]/g, ''))}
                    placeholder="6-digit code"
                    required
                    disabled={busy}
                    autoFocus
                  />
                  <small className="lg-hint">
                    <KeyRound size={12} /> Demo authenticator shows <strong>{DEMO_MFA_CODE.replace(/(\d{3})(\d{3})/, '$1 $2')}</strong>
                  </small>
                </label>
              )}
              <label className="lg-remember">
                <input type="checkbox" checked={remember} onChange={(ev) => setRemember(ev.target.checked)} /> Keep me signed in on this device (12 hours)
              </label>
              {error && (
                <div className="lg-error" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary lg-submit" disabled={busy || !email || !password}>
                <span>{busy ? 'Signing in…' : mfa ? 'Verify and sign in' : 'Sign in to workspace'}</span>
                {busy ? <LoaderCircle size={18} className="lg-spin" /> : <ArrowRight size={18} />}
              </button>
            </form>

            <div className="lg-help">
              <ShieldCheck size={20} />
              <p>
                Your administrator manages workspace access.
                <br />
                Contact them if you need help signing in.
              </p>
            </div>

            <div className="lg-demo">
              <button type="button" className="lg-demo-toggle" onClick={() => setDemoOpen(!demoOpen)} aria-expanded={demoOpen}>
                Demo accounts <ChevronDown size={14} style={{ transform: demoOpen ? 'rotate(180deg)' : undefined }} />
              </button>
              {demoOpen && (
                <div className="lg-demo-list">
                  <p>
                    Password for every account: <code>{DEMO_PASSWORD}</code>
                  </p>
                  {ACCOUNTS.map((a) => (
                    <button key={a.email} type="button" onClick={() => pick(a.email)}>
                      <span className="lg-avatar">{a.initials}</span>
                      <span>
                        <strong>
                          {a.name} <em>{a.title}</em>
                        </strong>
                        <small>
                          {a.email} · {ROLE_LABEL[a.role]}
                          {a.mfa ? ' · authenticator' : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="lg-mobile-visual">
            <OperationsGraphic />
          </div>
          <div className="lg-copyright">
            Integrated Workforce <span>·</span> Operations workspace
          </div>
        </section>
      </div>
    </main>
  );
};
