import React, { useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import { useFinance } from '../store';
import { balanceOf, fmtDate, kes, round2, TODAY } from '../engine';
import type { Account, AccountType } from '../types';
import { Chips, Drawer, SearchBox, SuitePage } from '../../ui/kit';

const TYPES: { value: AccountType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ASSET', label: 'Assets' },
  { value: 'LIABILITY', label: 'Liabilities' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expenses' }
];

export const AccountsPage: React.FC = () => {
  const { state, entries } = useFinance();
  const [type, setType] = useState<AccountType | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Account | null>(null);
  const year = TODAY.slice(0, 4);

  const list = state.accounts
    .filter((a) => type === 'ALL' || a.type === type)
    .filter((a) => !q || `${a.code} ${a.name} ${a.group}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((a) => `${a.type}|${a.group}`))];

  return (
    <SuitePage eyebrow="General ledger" title="Chart of accounts" subtitle="Every account with its balance today and its movement this year. Open an account to see each entry.">
      <div className="sx-toolbar">
        <Chips value={type} onChange={setType} options={TYPES.map((t) => ({ ...t, count: state.accounts.filter((a) => t.value === 'ALL' || a.type === t.value).length }))} />
        <SearchBox value={q} onChange={setQ} placeholder="Search accounts…" />
      </div>
      <div className="sx-table-wrap">
        <div className="sx-table-scroll">
          <table className="sx-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Code</th>
                <th>Account</th>
                <th className="sx-hide-sm">Type</th>
                <th style={{ textAlign: 'right' }}>This year</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const [t, name] = g.split('|');
                const accs = list.filter((a) => a.type === t && a.group === name);
                return (
                  <React.Fragment key={g}>
                    <tr className="sx-group-row">
                      <td colSpan={5}>{name}</td>
                    </tr>
                    {accs.map((a) => (
                      <tr key={a.code} className="clickable" onClick={() => setOpen(a)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(a)}>
                        <td className="sx-mono">{a.code}</td>
                        <td>
                          {a.name}
                          {a.control && <span className="sx-tag">Control</span>}
                          {a.bank && <span className="sx-tag">Bank</span>}
                        </td>
                        <td className="sx-hide-sm sx-muted">{a.type.charAt(0) + a.type.slice(1).toLowerCase()}</td>
                        <td style={{ textAlign: 'right' }} className="sx-muted">
                          {balanceOf(entries, a, { from: `${year}-01-01` }).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <b>{balanceOf(entries, a).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {open && <AccountLedger account={open} onClose={() => setOpen(null)} />}
    </SuitePage>
  );
};

const AccountLedger: React.FC<{ account: Account; onClose: () => void }> = ({ account, onClose }) => {
  const { entries, setPage, setFocus, state } = useFinance();
  const lines = entries.filter((e) => e.account === account.code);
  const debitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';
  let run = 0;
  const rows = lines.map((e) => ({ ...e, balance: (run = round2(run + (debitNormal ? e.debit - e.credit : e.credit - e.debit))) }));
  const latest = rows.slice(-40).reverse();
  const open = (sourceId: string) => {
    const doc = state.documents.find((d) => d.id === sourceId);
    const set = state.settlements.find((s) => s.id === sourceId);
    if (doc) setPage(doc.kind === 'INVOICE' ? 'invoices' : 'bills', sourceId);
    else if (set) setPage(set.kind === 'RECEIPT' ? 'receipts' : 'payments', sourceId);
    else setPage('journals', sourceId);
    setFocus(sourceId);
  };
  return (
    <Drawer wide title={`${account.code} · ${account.name}`} subtitle={`${account.group} · ${lines.length} entries`} onClose={onClose}>
      <div className="sx-amount-hero">
        <div>
          <span>Balance today</span>
          <strong>{kes(run)}</strong>
        </div>
        <div>
          <span>Normal side</span>
          <b>{debitNormal ? 'Debit' : 'Credit'}</b>
        </div>
      </div>
      <h4 className="sx-subhead">
        <BookOpenCheck size={14} /> Latest {latest.length} entries
      </h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th style={{ textAlign: 'right' }}>Debit</th>
            <th style={{ textAlign: 'right' }}>Credit</th>
            <th style={{ textAlign: 'right' }} className="sx-hide-sm">
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {latest.map((e) => (
            <tr key={e.id} className="clickable" onClick={() => open(e.sourceId)}>
              <td>{fmtDate(e.date)}</td>
              <td>
                <b className="sx-mono">{e.ref}</b>
                <small className="sx-muted sx-block">
                  {e.source} · {e.memo}
                </small>
              </td>
              <td style={{ textAlign: 'right' }}>{e.debit ? e.debit.toLocaleString() : ''}</td>
              <td style={{ textAlign: 'right' }}>{e.credit ? e.credit.toLocaleString() : ''}</td>
              <td style={{ textAlign: 'right' }} className="sx-hide-sm">
                {e.balance.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Drawer>
  );
};
