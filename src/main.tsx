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
import './styles/leave.css'
import './styles/payroll.css'
import './styles/pager.css'
import './styles/login.css'
import './styles/hire.css'
import './styles/time.css'
import './styles/osh.css'
import './styles/perf.css'
import './styles/training.css'
import './styles/welfare.css'
import './styles/travel.css'
import { AppProvider } from './context/AppContext.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

