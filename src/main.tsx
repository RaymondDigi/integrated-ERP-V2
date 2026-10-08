import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/design-system.css'
import './styles/forms.css'
import './styles/digicraft.css'
import './styles/polish.css'
import './styles/ess.css'
import './styles/ess-records.css'
import './styles/p9.css'
import './styles/ess-ai.css'
import './styles/employee-wizard.css'
import './styles/company-setup.css'
import './styles/module-launcher.css'
import './styles/suite.css'
import './styles/platform.css'
import './styles/leave.css'
import './styles/payroll.css'
import './styles/pager.css'
import './styles/login.css'
import './styles/hire.css'
import './styles/time.css'
import './styles/osh.css'
import './styles/perf.css'
import './styles/training.css'
import { AppProvider } from './context/AppContext.tsx'
import App from './App.tsx'

// Installable on phones and tablets (home-screen app); only the production build registers the offline shell
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

