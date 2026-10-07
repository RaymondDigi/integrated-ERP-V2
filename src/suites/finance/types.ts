export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  group: string;
  /** Bank accounts can be reconciled and receive or send money. */
  bank?: boolean;
  /** Control accounts are only posted through sub-ledgers (invoices, bills). */
  control?: boolean;
}

export type FinRole = 'ACCOUNTANT' | 'MANAGER' | 'DIRECTOR';

export interface Actor {
  role: FinRole;
  name: string;
  title: string;
}

/** Workflow every finance document goes through. */
export type DocStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'VOID';

export interface HistoryEntry {
  at: string;
  by: string;
  action: string;
  note?: string;
}

export interface Approval {
  by: string;
  role: FinRole;
  at: string;
}

interface Workflow {
  status: DocStatus;
  preparedBy: string;
  approvals: Approval[];
  history: HistoryEntry[];
}

export interface Party {
  id: string;
  kind: 'CUSTOMER' | 'SUPPLIER';
  name: string;
  pin: string;
  email: string;
  phone: string;
  terms: number;
  creditLimit?: number;
  category: string;
}

export interface DocLine {
  id: string;
  description: string;
  account: string;
  qty: number;
  price: number;
  vat: boolean;
}

/** Sales invoice (AR) or supplier bill (AP). */
export interface FinDocument extends Workflow {
  id: string;
  kind: 'INVOICE' | 'BILL';
  number: string;
  partyId: string;
  date: string;
  dueDate: string;
  reference: string;
  department: string;
  lines: DocLine[];
  notes: string;
  /** Supplier bills: purchase order and goods-received checks. */
  match?: { po: string; grn: string; matched: boolean };
}

export interface Allocation {
  docId: string;
  amount: number;
}

/** Customer receipt (money in) or supplier payment (money out). */
export interface Settlement extends Workflow {
  id: string;
  kind: 'RECEIPT' | 'PAYMENT';
  number: string;
  partyId: string;
  date: string;
  bankAccount: string;
  method: 'EFT' | 'RTGS' | 'M-PESA' | 'CHEQUE' | 'CASH';
  reference: string;
  amount: number;
  allocations: Allocation[];
  notes: string;
}

export interface JournalLine {
  id: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
  department?: string;
}

export interface Journal extends Workflow {
  id: string;
  number: string;
  date: string;
  memo: string;
  source: 'MANUAL' | 'OPENING' | 'DEPRECIATION' | 'BANK' | 'ASSET' | 'REVERSAL';
  lines: JournalLine[];
  reversalOf?: string;
  reversedBy?: string;
}

export interface BankLine {
  id: string;
  bankAccount: string;
  date: string;
  description: string;
  reference: string;
  /** Positive money in, negative money out. */
  amount: number;
  matchedTo?: string;
}

export interface FixedAsset {
  id: string;
  number: string;
  name: string;
  category: string;
  costAccount: string;
  acquired: string;
  cost: number;
  residual: number;
  lifeMonths: number;
  /** Depreciation charged before this system took over. */
  openingDepreciation: number;
  location: string;
  custodian: string;
  status: 'ACTIVE' | 'DISPOSED';
}

export interface DepreciationRun {
  period: string;
  journalId: string;
  amount: number;
  perAsset: Record<string, number>;
  at: string;
  by: string;
}

export interface Period {
  key: string;
  status: 'OPEN' | 'CLOSED';
  closedBy?: string;
  closedAt?: string;
  checklist: Record<string, boolean>;
}

export interface BudgetLine {
  account: string;
  department: string;
  monthly: number[];
}

export interface FinanceState {
  actor: Actor;
  accounts: Account[];
  parties: Party[];
  documents: FinDocument[];
  settlements: Settlement[];
  journals: Journal[];
  bankLines: BankLine[];
  assets: FixedAsset[];
  depreciationRuns: DepreciationRun[];
  periods: Period[];
  budgets: BudgetLine[];
  budgetYear: number;
  sequence: Record<string, number>;
}

export interface LedgerEntry {
  id: string;
  date: string;
  account: string;
  debit: number;
  credit: number;
  source: string;
  sourceId: string;
  ref: string;
  memo: string;
  department?: string;
}
