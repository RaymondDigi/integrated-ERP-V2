import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  ArrowDownLeft,
  Users,
  Receipt,
  ArrowUpRight,
  Truck,
  BookOpen,
  ListTree,
  Landmark,
  Target,
  Building2,
  Lock,
  BarChart3,
  RotateCcw,
  ChevronRight,
  Undo2,
  BellRing,
  Banknote,
  Repeat,
  Wallet,
  LineChart,
  Coins,
  PieChart,
  Boxes,
  Percent,
  Network,
  HandCoins,
  Library,
  PenSquare,
  Settings2
} from 'lucide-react';
import { useFinance, type FinancePage } from './store';
import { isOverdue, periodOf, permissions, TODAY } from './engine';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { ActorSwitcher } from './parts';
import { FinanceOverview } from './pages/Overview';
import { DocumentsPage } from './pages/Documents';
import { SettlementsPage } from './pages/Settlements';
import { PartiesPage } from './pages/Parties';
import { JournalsPage } from './pages/Journals';
import { AccountsPage } from './pages/Accounts';
import { BankPage } from './pages/Bank';
import { BudgetsPage, AssetsPage, ClosePage } from './pages/Planning';
import { ReportsPage } from './pages/Reports';
import { MemosPage } from './pages/Memos';
import { CollectionsPage } from './pages/Collections';
import { PaymentRunsPage } from './pages/PaymentRuns';
import { RecurringPage } from './pages/Recurring';
import { CashbookPage } from './pages/Cashbook';
import { TreasuryPage } from './pages/Treasury';
import { ForecastPage } from './pages/Forecast';
import { CostingPage } from './pages/Costing';
import { InventoryGlPage } from './pages/InventoryGl';
import { TaxPage } from './pages/Tax';
import { GroupPage } from './pages/Group';
import { StaffPage } from './pages/Staff';
import { AnalysisPage } from './pages/Analysis';
import { WriterPage } from './pages/Writer';
import { SetupPage } from './pages/Setup';
import type { FinDocument, Journal, Memo, Settlement } from './types';
import './finance.css';

export const FINANCE_PAGE_LABEL: Record<FinancePage, string> = {
  overview: 'Overview',
  invoices: 'Sales invoices',
  receipts: 'Customer receipts',
  customers: 'Customers',
  bills: 'Supplier bills',
  payments: 'Supplier payments',
  suppliers: 'Suppliers',
  journals: 'Journals',
  accounts: 'Chart of accounts',
  bank: 'Bank reconciliation',
  budgets: 'Budgets',
  assets: 'Fixed assets',
  close: 'Month-end close',
  reports: 'Reports',
  memos: 'Credit & debit memos',
  collections: 'Credit & collections',
  paymentRuns: 'Payment runs',
  recurring: 'Recurring & batches',
  cashbook: 'Cash book',
  treasury: 'Treasury',
  forecast: 'Cash forecast',
  costing: 'Cost accounting',
  inventory: 'Inventory & production',
  tax: 'Tax',
  group: 'Group & consolidation',
  staff: 'Staff loans & advances',
  analysis: 'Report library',
  writer: 'Report writer',
  setup: 'Finance setup'
};

export const FinanceSidebar: React.FC = () => {
  const { state, actor, page, setPage, reset, setCompany } = useFinance();
  // Badges count what the current role can approve or post
  const canAct = (d: FinDocument | Settlement | Journal | Memo) => {
    const p = permissions(state, d, actor);
    return p.approve || p.post;
  };
  const docs = (k: FinDocument['kind']) => state.documents.filter((d) => d.kind === k && canAct(d)).length;
  const sets = (k: Settlement['kind']) => state.settlements.filter((d) => d.kind === k && canAct(d)).length;
  const overdue = state.documents.filter((d) => d.kind === 'INVOICE' && isOverdue(state, d)).length;
  const groups: SuiteNavGroup<FinancePage>[] = [
    { label: 'Finance', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Receivables',
      items: [
        { id: 'invoices', label: 'Sales invoices', icon: FileText, badge: docs('INVOICE') || overdue, badgeTone: docs('INVOICE') ? 'warning' : 'critical' },
        { id: 'receipts', label: 'Customer receipts', icon: ArrowDownLeft, badge: sets('RECEIPT') },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'collections', label: 'Credit & collections', icon: BellRing },
        { id: 'memos', label: 'Credit & debit memos', icon: Undo2, badge: state.memos.filter(canAct).length }
      ]
    },
    {
      label: 'Payables',
      items: [
        { id: 'bills', label: 'Supplier bills', icon: Receipt, badge: docs('BILL') },
        { id: 'payments', label: 'Supplier payments', icon: ArrowUpRight, badge: sets('PAYMENT') },
        { id: 'suppliers', label: 'Suppliers', icon: Truck },
        { id: 'paymentRuns', label: 'Payment runs', icon: Banknote, badge: state.paymentRuns.filter((r) => r.status === 'SUBMITTED' || r.status === 'APPROVED').length },
        { id: 'recurring', label: 'Recurring & batches', icon: Repeat },
        { id: 'staff', label: 'Staff loans & advances', icon: HandCoins, badge: state.staffLoans.filter((l) => l.status === 'SUBMITTED').length }
      ]
    },
    {
      label: 'Ledger & cash',
      items: [
        { id: 'journals', label: 'Journals', icon: BookOpen, badge: state.journals.filter(canAct).length },
        { id: 'accounts', label: 'Chart of accounts', icon: ListTree },
        { id: 'bank', label: 'Bank reconciliation', icon: Landmark, badge: state.bankLines.filter((l) => !l.matchedTo).length },
        { id: 'cashbook', label: 'Cash book', icon: Wallet },
        { id: 'costing', label: 'Cost accounting', icon: PieChart },
        { id: 'inventory', label: 'Inventory & production', icon: Boxes }
      ]
    },
    {
      label: 'Treasury & tax',
      items: [
        { id: 'treasury', label: 'Treasury', icon: Coins },
        { id: 'forecast', label: 'Cash forecast', icon: LineChart },
        { id: 'tax', label: 'Tax', icon: Percent },
        { id: 'group', label: 'Group & consolidation', icon: Network }
      ]
    },
    {
      label: 'Planning & close',
      items: [
        { id: 'budgets', label: 'Budgets', icon: Target },
        { id: 'assets', label: 'Fixed assets', icon: Building2 },
        { id: 'close', label: 'Month-end close', icon: Lock, badge: state.periods.filter((p) => p.status === 'OPEN' && p.key < periodOf(TODAY)).length, badgeTone: 'neutral' },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'analysis', label: 'Report library', icon: Library },
        { id: 'writer', label: 'Report writer', icon: PenSquare },
        { id: 'setup', label: 'Finance setup', icon: Settings2 }
      ]
    }
  ];
  return (
    <SuiteSidebar
      name="Finance"
      tagline="Accounting & treasury"
      icon={Landmark}
      groups={groups}
      active={page}
      onSelect={(p) => setPage(p)}
      footer={
        <div className="sx-side-actor">
          <select className="fx-company" value={state.activeCompany} onChange={(e) => setCompany(e.target.value)} aria-label="Company">
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <ActorSwitcher />
          <button type="button" className="sx-link sx-reset" onClick={reset} title="Restore the demo data">
            <RotateCcw size={12} /> Reset demo data
          </button>
        </div>
      }
    />
  );
};

/** Breadcrumb tail shown in the app header while Finance is open. */
export const FinanceCrumb: React.FC = () => {
  const { page, setPage } = useFinance();
  return (
    <span className="sx-crumb">
      <button type="button" onClick={() => setPage('overview')}>
        Finance
      </button>
      {page !== 'overview' && (
        <>
          <ChevronRight size={11} />
          <b>{FINANCE_PAGE_LABEL[page]}</b>
        </>
      )}
    </span>
  );
};

export const FinanceSuite: React.FC = () => {
  const { page } = useFinance();
  // Every page opens at the top, including when arriving from another module
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [page]);
  return (
    <div className="sx-suite" key={page}>
      {page === 'overview' && <FinanceOverview />}
      {page === 'invoices' && <DocumentsPage kind="INVOICE" />}
      {page === 'bills' && <DocumentsPage kind="BILL" />}
      {page === 'receipts' && <SettlementsPage kind="RECEIPT" />}
      {page === 'payments' && <SettlementsPage kind="PAYMENT" />}
      {page === 'customers' && <PartiesPage kind="CUSTOMER" />}
      {page === 'suppliers' && <PartiesPage kind="SUPPLIER" />}
      {page === 'journals' && <JournalsPage />}
      {page === 'accounts' && <AccountsPage />}
      {page === 'bank' && <BankPage />}
      {page === 'budgets' && <BudgetsPage />}
      {page === 'assets' && <AssetsPage />}
      {page === 'close' && <ClosePage />}
      {page === 'reports' && <ReportsPage />}
      {page === 'memos' && <MemosPage />}
      {page === 'collections' && <CollectionsPage />}
      {page === 'paymentRuns' && <PaymentRunsPage />}
      {page === 'recurring' && <RecurringPage />}
      {page === 'cashbook' && <CashbookPage />}
      {page === 'treasury' && <TreasuryPage />}
      {page === 'forecast' && <ForecastPage />}
      {page === 'costing' && <CostingPage />}
      {page === 'inventory' && <InventoryGlPage />}
      {page === 'tax' && <TaxPage />}
      {page === 'group' && <GroupPage />}
      {page === 'staff' && <StaffPage />}
      {page === 'analysis' && <AnalysisPage />}
      {page === 'writer' && <WriterPage />}
      {page === 'setup' && <SetupPage />}
    </div>
  );
};
