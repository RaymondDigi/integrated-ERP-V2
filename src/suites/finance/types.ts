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
  /** Inactive accounts stay in history but cannot be chosen for new postings. */
  active?: boolean;
  /** Statistical accounts hold quantities (headcount, m², kg) and stay out of the money ledger. */
  statistical?: boolean;
  /** Unit for statistical accounts, e.g. "staff" or "kg". */
  unit?: string;
  /** Header accounts group others and cannot be posted to. */
  postingAllowed?: boolean;
  /** Currency of a foreign currency bank account (base KES when absent). */
  currency?: string;
  /** ESG tag used by the ESG report, e.g. energy or fuel. */
  esg?: { category: 'ENERGY' | 'FUEL' | 'WATER' | 'SOCIAL' | 'COMMUNITY'; factor: number; unit: string };
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
  /** Field-level before/after values recorded when a draft is edited. */
  changes?: { field: string; before: string; after: string }[];
}

export interface Approval {
  by: string;
  role: FinRole;
  at: string;
}

export interface Workflow {
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
  /** Payment hold on every bill of a supplier (or every receipt allocation of a customer). */
  paymentHold?: Hold;
  /** Early-payment discount, e.g. 2% if paid within 10 days. */
  earlyDiscount?: { pct: number; days: number };
  /** Standard trade discount applied to new invoice lines for this customer. */
  discountPct?: number;
  contacts?: PartyContact[];
  notes?: PartyNote[];
  addresses?: PartyAddress[];
  creditExtensions?: CreditExtension[];
  /** Customer-specific ageing bucket limits in days, e.g. [15, 30, 45, 60]. */
  agingBuckets?: number[];
  /** Invoice and statement layout (InvoiceTemplate id). */
  templateId?: string;
  /** Default transaction currency. */
  currency?: string;
  /** Internal collector or outside agency handling overdue accounts. */
  collector?: string;
  salesRep?: string;
}

export interface Hold {
  by: string;
  at: string;
  reason: string;
}

export interface PartyContact {
  id: string;
  name: string;
  role: 'BILLING' | 'AR' | 'AP' | 'OTHER';
  email: string;
  phone: string;
}

export interface PartyNote {
  at: string;
  by: string;
  text: string;
  promiseDate?: string;
  invoiceId?: string;
}

/** Bill-to and ship-to locations with their own tax registration. */
export interface PartyAddress {
  id: string;
  type: 'BILL_TO' | 'SHIP_TO';
  label: string;
  address: string;
  taxCode: string;
  taxId: string;
  templateId?: string;
}

export interface CreditExtension {
  id: string;
  amount: number;
  from: string;
  to: string;
  reason: string;
  approvedBy: string;
}

export interface DocLine {
  id: string;
  description: string;
  account: string;
  qty: number;
  price: number;
  vat: boolean;
  /** Tax code from the tax master; the rate is copied onto the line when it is entered. */
  taxCode?: string;
  taxRate?: number;
  /** Reverse-charge (use tax): self-assessed input and output VAT, nothing added to the total. */
  reverseCharge?: boolean;
  /** Levies posted on top of VAT, copied from the tax master when the line is entered. */
  levies?: { code: string; rate: number; account: string }[];
  costCenter?: string;
  project?: string;
  plant?: string;
  /** List price and discount when a customer trade discount was applied. */
  listPrice?: number;
  discountPct?: number;
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
  match?: { po: string; grn: string; matched: boolean; note?: string; override?: string };
  companyId?: string;
  currency?: string;
  /** KES per unit of the document currency on the document date. */
  fxRate?: number;
  /** Payment hold on this one document. */
  hold?: Hold;
  /** Entry batch the document was keyed in. */
  batchId?: string;
  billToId?: string;
  shipToId?: string;
  /** Debit notes, finance charges and chargebacks are open items like invoices and bills. */
  memoType?: 'DEBIT_NOTE' | 'FINANCE_CHARGE' | 'CHARGEBACK';
  /** Document a debit note, finance charge or chargeback relates to. */
  relatesTo?: string;
  delivery?: InvoiceDelivery;
  recurringId?: string;
  salesRep?: string;
  /** Early-payment discount terms copied from the party when the bill is saved. */
  earlyDiscount?: { pct: number; days: number };
  /** Booked net of the early-payment discount (net method). */
  netMethod?: boolean;
  poNumber?: string;
  returnRef?: string;
}

/** E-invoice delivery to the customer (KRA eTIMS and email are simulated in this build). */
export interface InvoiceDelivery {
  status: 'SENT' | 'VIEWED' | 'DISPUTED' | 'ACCEPTED';
  channel: 'EMAIL' | 'PORTAL' | 'ETIMS';
  sentAt: string;
  sentBy: string;
  etims?: { cuInvoiceNo: string; qr: string; at: string };
  dispute?: { at: string; reason: string; resolved?: string };
  payLink?: string;
}

export interface Allocation {
  docId: string;
  amount: number;
  /** Early-payment discount taken on this document. */
  discount?: number;
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
  companyId?: string;
  currency?: string;
  fxRate?: number;
  /** Withholding tax deducted from the payment (or withheld by the customer). */
  wht?: { code: string; rate: number; amount: number };
  /** Advances sit on an advance account until applied to an invoice or bill. */
  purpose?: 'NORMAL' | 'ADVANCE' | 'PREPAYMENT' | 'DOWNPAYMENT';
  poNumber?: string;
  /** Order value a down payment is measured against. */
  poValue?: number;
  chequeNo?: string;
  runId?: string;
  /** A posted payment that was cancelled (stopped cheque, failed transfer) — reversed on this date. */
  voided?: { by: string; at: string; date: string; reason: string };
  /** Simulated bank transmission. */
  bankStatus?: { status: 'SENT' | 'CONFIRMED' | 'REJECTED'; ref: string; at: string; file: string };
}

export interface JournalLine {
  id: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
  department?: string;
  costCenter?: string;
  project?: string;
  plant?: string;
  /** Inter-company counterparty for 1180/2180 lines. */
  partnerCompany?: string;
  /** Quantity for statistical accounts. */
  quantity?: number;
  /** Foreign currency amount behind the line. */
  currency?: string;
  fxAmount?: number;
}

export type JournalSource =
  | 'MANUAL'
  | 'OPENING'
  | 'DEPRECIATION'
  | 'BANK'
  | 'ASSET'
  | 'REVERSAL'
  | 'CASH'
  | 'PAYROLL'
  | 'INVENTORY'
  | 'ALLOCATION'
  | 'YEAR_END'
  | 'FX'
  | 'ECL'
  | 'TREASURY'
  | 'INTERCOMPANY'
  | 'TAX'
  | 'COSTING'
  | 'SYSTEM';

export interface Journal extends Workflow {
  id: string;
  number: string;
  date: string;
  memo: string;
  source: JournalSource;
  lines: JournalLine[];
  reversalOf?: string;
  reversedBy?: string;
  companyId?: string;
  reasonCode?: string;
  /** Accruals: reversed automatically on this date. */
  autoReverseOn?: string;
  /** Posts into a special (adjustment) period instead of the normal one for its date. */
  periodKey?: string;
  templateId?: string;
  /** Cash journal fields. */
  cash?: { account: string; type: 'IN' | 'OUT'; payee: string; ref: string };
  /** Other system or module that raised it (Payroll, Inventory, Maintenance…). */
  origin?: string;
  /** Documents raised from this journal (reversals, bills, retirements). */
  followOn?: { kind: string; id: string; number: string }[];
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
  companyId?: string;
  /** Statement file the line came from. */
  importId?: string;
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
  status: 'ACTIVE' | 'DISPOSED' | 'TRANSFERRED' | 'REVERSED';
  companyId?: string;
  costCenter?: string;
  /** Straight line (default) or reducing balance at rbRate per year. */
  method?: 'SL' | 'RB';
  rbRate?: number;
  /** Net revaluation (+) or impairment (−) added to the carrying amount. */
  revaluation?: number;
  capitalJournalId?: string;
  disposal?: { date: string; proceeds: number; gainLoss: number; journalId: string };
  /** Month the asset's own depreciation year starts (1–12). */
  fiscalYearStart?: number;
  equipmentId?: string;
  history?: HistoryEntry[];
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
  /** CLOSED is a hard close. SOFT closes the sub-ledgers; managers can still post journals. */
  status: 'OPEN' | 'SOFT' | 'CLOSED';
  closedBy?: string;
  closedAt?: string;
  checklist: Record<string, boolean>;
  /** User-defined periods carry their own dates; calendar months are derived from the key. */
  from?: string;
  to?: string;
  fiscalYear?: string;
  /** Adjustment periods (13–16) dated on the last day of the year. */
  special?: boolean;
  label?: string;
  history?: HistoryEntry[];
  reopenRequests?: ReopenRequest[];
  owner?: string;
  due?: string;
}

export interface ReopenRequest {
  id: string;
  by: string;
  at: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decidedAt?: string;
}

export interface FiscalYear {
  id: string;
  name: string;
  start: string;
  end: string;
  pattern: 'MONTHLY' | '4-4-5' | '13';
  specialPeriods: number;
  status: 'OPEN' | 'CLOSED';
  createdBy: string;
}

export interface BudgetLine {
  account: string;
  department: string;
  monthly: number[];
  /** Budget year (the state's budgetYear when absent). */
  year?: number;
  version?: string;
  costCenter?: string;
  objectiveId?: string;
  status?: 'DRAFT' | 'APPROVED';
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
  /* ---- Extensions (see ext/*) ---- */
  companies: Company[];
  activeCompany: string;
  fiscalYears: FiscalYear[];
  taxCodes: TaxCode[];
  currencies: Currency[];
  costCenters: CostCenter[];
  costObjects: CostObject[];
  reasonCodes: ReasonCode[];
  approvalRules: ApprovalRule[];
  settings: FinanceSettings;
  memos: Memo[];
  applications: Application[];
  recurring: RecurringDoc[];
  journalTemplates: JournalTemplate[];
  paymentRuns: PaymentRun[];
  budgetChanges: BudgetChange[];
  objectives: StrategicObjective[];
  reportDefs: ReportDefinition[];
  collectionLog: CollectionAction[];
  invoiceBatches: InvoiceBatch[];
  instruments: TreasuryInstrument[];
  staffLoans: StaffLoan[];
  taxFilings: TaxFiling[];
  allocationRules: AllocationRule[];
  activities: CostActivity[];
  inventoryPostings: { ref: string; journalId: string; at: string; amount: number; kind: string }[];
  rateCards: RateCard[];
  invoiceTemplates: InvoiceTemplate[];
  statementImports: { id: string; account: string; file: string; lines: number; matched: number; receipts: number; at: string; by: string }[];
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
  costCenter?: string;
  project?: string;
  plant?: string;
  companyId?: string;
  partnerCompany?: string;
  /** Supplier invoice or customer order number behind the entry. */
  extRef?: string;
  partyId?: string;
  currency?: string;
  fxAmount?: number;
  /** Year-end closing entries are left out of the income statement. */
  closing?: boolean;
  quantity?: number;
}

/* ------------------------------------------------------------------ */
/* Extension entities                                                  */
/* ------------------------------------------------------------------ */

export interface Company {
  id: string;
  code: string;
  name: string;
  pin: string;
  baseCurrency: string;
  /** Division or plant names used as a reporting dimension. */
  plants: string[];
  closeOwner: string;
}

export type TaxKind = 'VAT' | 'ZERO' | 'EXEMPT' | 'REVERSE' | 'WHT' | 'LEVY' | 'EXCISE';
export interface TaxCode {
  code: string;
  name: string;
  kind: TaxKind;
  /** Rate history: the rate in force on a document date is used. */
  rates: { from: string; rate: number }[];
  appliesTo: 'SALES' | 'PURCHASE' | 'BOTH';
  /** Output / payable account (sales, WHT and levies). */
  account: string;
  /** Input / recoverable account for purchases. */
  inputAccount?: string;
  active: boolean;
  due?: { frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'; day: number };
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** KES per unit, oldest first. */
  rates: { date: string; rate: number }[];
}

export interface CostCenter {
  code: string;
  name: string;
  type: 'COST' | 'PROFIT';
  companyId: string;
  manager: string;
  parent?: string;
  department?: string;
  active: boolean;
}

/** Projects, client orders and events whose costs are collected and settled. */
export interface CostObject {
  id: string;
  code: string;
  name: string;
  type: 'PROJECT' | 'ORDER' | 'EVENT';
  customerId?: string;
  companyId: string;
  status: 'OPEN' | 'COMPLETED' | 'SETTLED';
  /** Cost sheet: estimate per category; actuals come from the ledger. */
  estimate: { category: string; account: string; amount: number }[];
  revenueEstimate: number;
  settlement?: { mode: 'CAPITALISE' | 'EXPENSE'; target: string; journalId: string; at: string; amount: number };
}

export interface ReasonCode {
  code: string;
  label: string;
  appliesTo: 'JOURNAL' | 'CREDIT_NOTE' | 'WRITE_OFF' | 'ALL';
}

/** Approval levels by document type, department and amount. */
export interface ApprovalRule {
  id: string;
  docType: 'ANY' | 'INVOICE' | 'BILL' | 'RECEIPT' | 'PAYMENT' | 'JOURNAL' | 'MEMO' | 'PAYMENT_RUN' | 'BUDGET' | 'LOAN';
  department?: string;
  /** Above this value the Finance Director must give a second approval. */
  directorAbove: number;
}

export interface FinanceSettings {
  /** Account code mask: 9 = digit, A = letter, other characters literal (e.g. 9999 or 99-9999). */
  accountMask: string;
  discountMethod: 'GROSS' | 'NET';
  /** Monthly finance charge % on overdue balances. */
  financeChargePct: number;
  /** Charge interest on earlier finance charges. */
  financeChargeCompound: boolean;
  /** Days overdue before finance charges apply. */
  financeChargeFrom: number;
  /** No collection call or finance charge below this balance. */
  collectionMinimum: number;
  /** Alert management when overdue receivables exceed this share of receivables. */
  overdueTolerancePct: number;
  /** Alert when a customer is over the limit by more than this %. */
  overLimitTolerancePct: number;
  /** Price / quantity tolerance for three-way matching. */
  matchTolerancePct: number;
  /** Down payments cannot exceed this share of the order value. */
  downPaymentLimitPct: number;
  /** Pre-posting checklist per document type. */
  postingChecklist: Record<'BILL' | 'INVOICE' | 'PAYMENT' | 'JOURNAL', string[]>;
  /** Expected credit loss rates per ageing bucket. */
  eclRates: number[];
  /** Expected inventory loss rates by stock age (0–90, 91–180, 181–365, 365+ days). */
  inventoryLossRates: number[];
  /** Block (true) or warn (false) when a document exceeds the remaining budget. */
  budgetBlock: boolean;
  /** Collection stages by days overdue. */
  dunning: { days: number; action: 'REMINDER' | 'DUNNING_1' | 'DUNNING_2' | 'CALL' | 'AGENCY'; letter: string }[];
  corporateTaxRate: number;
}

/** Credit note to a customer, or debit memo / credit note against a supplier: reduces what is owed. */
export interface Memo extends Workflow {
  id: string;
  number: string;
  side: 'AR' | 'AP';
  partyId: string;
  date: string;
  lines: DocLine[];
  reasonCode: string;
  /** Applications to open invoices or bills (partial or across several). */
  allocations: Allocation[];
  originalDocId?: string;
  poNumber?: string;
  /** Customer return (RMA) or vendor return note it settles. */
  rmaRef?: string;
  returnRef?: string;
  notes: string;
  department: string;
  companyId?: string;
  currency?: string;
  fxRate?: number;
  salesRep?: string;
}

/** Later application of advances, prepayments, write-offs and transfers to open items. */
export interface Application {
  id: string;
  kind: 'ADVANCE' | 'PREPAYMENT' | 'WRITE_OFF' | 'TRANSFER';
  sourceId: string;
  docId: string;
  amount: number;
  date: string;
  journalId: string;
  by: string;
  reasonCode?: string;
}

export interface RecurringDoc {
  id: string;
  name: string;
  kind: 'BILL' | 'INVOICE';
  partyId: string;
  lines: DocLine[];
  department: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  dayOfMonth: number;
  start: string;
  end?: string;
  nextRun: string;
  notifyDaysBefore: number;
  active: boolean;
  generated: string[];
  companyId?: string;
}

export interface JournalTemplate {
  id: string;
  name: string;
  memo: string;
  lines: JournalLine[];
  frequency: 'NONE' | 'MONTHLY' | 'QUARTERLY';
  nextRun?: string;
  end?: string;
  autoReverse: boolean;
  reasonCode?: string;
  generated: string[];
}

export interface PaymentProposal {
  billId: string;
  partyId: string;
  amount: number;
  discount: number;
  include: boolean;
  note?: string;
}

export interface PaymentRun extends Workflow {
  id: string;
  number: string;
  date: string;
  bankAccount: string;
  dueFrom: string;
  dueTo: string;
  method: Settlement['method'];
  proposals: PaymentProposal[];
  /** Payments created when the run was executed. */
  paymentIds: string[];
  chequeStart?: number;
  executedAt?: string;
  file?: { format: 'CSV' | 'PAIN001' | 'MT103'; name: string; at: string };
  bankRef?: string;
  voidReason?: string;
  companyId?: string;
}

export interface BudgetChange extends Workflow {
  id: string;
  number: string;
  type: 'SUPPLEMENTARY' | 'REALLOCATION';
  year: number;
  date: string;
  fromAccount?: string;
  toAccount: string;
  month: number;
  amount: number;
  reason: string;
}

export interface StrategicObjective {
  id: string;
  code: string;
  name: string;
  kpi: string;
  target: number;
  actual: number;
}

export interface ReportRow {
  id: string;
  label: string;
  kind: 'LINE' | 'SUBTOTAL' | 'HEADING';
  /** Account selection: code range "4000-4999", group "group:Revenue", type "type:INCOME" or list "6100,6200". */
  accounts?: string;
  /** Flip the sign (show credits as positive). */
  negate?: boolean;
  /** For subtotals: ids of rows to add (prefix "-" to subtract), comma separated. */
  formula?: string;
}
export interface ReportDefinition {
  id: string;
  name: string;
  rows: ReportRow[];
  columns: ('ACTUAL' | 'PRIOR_YEAR' | 'BUDGET' | 'VARIANCE')[];
  groupBy: 'NONE' | 'COMPANY' | 'COST_CENTER' | 'DEPARTMENT' | 'PLANT';
  pinned: boolean;
  owner: string;
}

export interface CollectionAction {
  id: string;
  invoiceId: string;
  partyId: string;
  at: string;
  by: string;
  action: 'REMINDER' | 'DUNNING_1' | 'DUNNING_2' | 'CALL' | 'AGENCY' | 'PROMISE' | 'NOTE' | 'FINANCE_CHARGE' | 'ASSIGNED';
  text: string;
  promiseDate?: string;
  agent?: string;
  amount?: number;
}

export interface InvoiceBatch {
  id: string;
  number: string;
  kind: 'INVOICE' | 'BILL';
  controlTotal: number;
  controlCount: number;
  docIds: string[];
  createdBy: string;
  at: string;
  hold?: Hold;
}

export interface TreasuryInstrument {
  id: string;
  number: string;
  type: 'DEPOSIT' | 'TBILL' | 'BOND' | 'LOAN_IN' | 'LOAN_OUT' | 'IC_LOAN' | 'FX_FWD' | 'LC';
  counterparty: string;
  principal: number;
  currency: string;
  rate: number;
  start: string;
  maturity: string;
  rollover: boolean;
  bankAccount: string;
  status: 'ACTIVE' | 'MATURED' | 'REPAID' | 'ROLLED' | 'EXPIRED' | 'CANCELLED';
  /** Interest accrued and posted so far. */
  accrued: number;
  /** Principal repaid so far (loans). */
  repaid: number;
  /** Clean price per 100 (bonds, T-bills) for mark-to-market. */
  marketValues: { date: string; price: number }[];
  /** Letters of credit. */
  lc?: { beneficiary: string; po: string; expiry: string; stage: 'APPLIED' | 'ISSUED' | 'DOCS_PRESENTED' | 'ACCEPTED' | 'PAID' | 'EXPIRED'; documents: string };
  /** FX forwards: contracted rate. */
  forwardRate?: number;
  partnerCompany?: string;
  journals: string[];
  history: HistoryEntry[];
  companyId?: string;
}

export interface StaffLoan extends Workflow {
  id: string;
  number: string;
  employeeId: string;
  employee: string;
  type: 'SALARY_ADVANCE' | 'STAFF_LOAN' | 'SURCHARGE';
  amount: number;
  monthly: number;
  date: string;
  recovered: { period: string; amount: number; journalId: string }[];
  disbursedJournalId?: string;
}

export interface TaxFiling {
  id: string;
  tax: string;
  period: string;
  amount: number;
  status: 'PREPARED' | 'FILED' | 'PAID';
  ackNo?: string;
  filedBy?: string;
  filedAt?: string;
  journalId?: string;
}

export interface AllocationRule {
  id: string;
  name: string;
  sourceAccount: string;
  sourceCostCenter?: string;
  targets: { costCenter: string; account: string; pct: number }[];
  lastRun?: string;
}

/** Activity-based costing: cost pool, driver and the quantities each cost centre consumed. */
export interface CostActivity {
  id: string;
  name: string;
  pool: string;
  driver: string;
  usage: Record<string, number>;
}

export interface RateCard {
  id: string;
  name: string;
  unit: 'HOUR' | 'DAY' | 'ITEM' | 'KG';
  rate: number;
  account: string;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  showPin: boolean;
  showBank: boolean;
  showTaxBreakdown: boolean;
  footer: string;
  accent: string;
  /** Trade terms printed under the totals, e.g. FOB Mombasa, payment in USD. */
  terms: string;
}
