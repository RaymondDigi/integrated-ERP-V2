import React, { useState } from 'react';
import { BookOpenCheck, Plus } from 'lucide-react';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { usePrompt } from '../ext/ui';
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
  const f = useFinance();
  const { state, entries } = f;
  const prompt = usePrompt();
  const [type, setType] = useState<AccountType | 'ALL'>('ALL');
  const groupsAll = [...new Set(state.accounts.map((a) => a.group))];
  const edit = (a: Account | null) =>
    prompt.open({
      title: a ? `Edit ${a.code}` : 'New account',
      subtitle: 'Codes are unique; inactive accounts keep their history but cannot be posted to.',
      fields: [
        { key: 'code', label: 'Code', initial: a?.code ?? '', required: true },
        { key: 'name', label: 'Name', initial: a?.name ?? '', required: true },
        { key: 'type', label: 'Type', type: 'select', options: TYPES.filter((t) => t.value !== 'ALL').map((t) => ({ value: t.value, label: t.label })), initial: a?.type ?? 'EXPENSE' },
        { key: 'group', label: 'Group', initial: a?.group ?? groupsAll[0], hint: groupsAll.slice(0, 6).join(', ') },
        { key: 'bank', label: 'Bank account', type: 'checkbox', initial: !!a?.bank },
        { key: 'control', label: 'Control account (sub-ledger only)', type: 'checkbox', initial: !!a?.control },
        { key: 'header', label: 'Header (no posting)', type: 'checkbox', initial: a?.postingAllowed === false },
        { key: 'stat', label: 'Statistical (quantities)', type: 'checkbox', initial: !!a?.statistical },
        { key: 'unit', label: 'Unit (statistical)', initial: a?.unit ?? '' },
        { key: 'currency', label: 'Currency (foreign bank)', initial: a?.currency ?? '' }
      ],
      onSubmit: (v) =>
        f.saveAccount(
          {
            ...a,
            code: v.code,
            name: v.name,
            type: v.type as AccountType,
            group: v.group,
            bank: v.bank === 'true' || undefined,
            control: v.control === 'true' || undefined,
            postingAllowed: v.header === 'true' ? false : undefined,
            statistical: v.stat === 'true' || undefined,
            unit: v.unit || undefined,
            currency: v.currency || undefined,
            active: a?.active
          },
          !a
        )
    });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Account | null>(null);
  const year = TODAY.slice(0, 4);

  const list = state.accounts
    .filter((a) => type === 'ALL' || a.type === type)
    .filter((a) => !q || `${a.code} ${a.name} ${a.group}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((a) => `${a.type}|${a.group}`))];

  return (
    <SuitePage
      eyebrow="General ledger"
      title="Chart of accounts"
      subtitle="Every account with its balance today and its movement this year. Open an account to see each entry."
      actions={
        <>
          <PrintButton title="Chart of accounts" html={() => `<h1>Chart of accounts</h1><table><tr><th>Code</th><th>Account</th><th>Type</th><th>Group</th><th>Flags</th><th class="r">Balance</th></tr>${state.accounts.map((a) => `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${esc(a.group)}</td><td>${[a.control && 'control', a.bank && 'bank', a.active === false && 'inactive', a.statistical && 'statistical', a.postingAllowed === false && 'header'].filter(Boolean).join(', ')}</td><td class="r">${balanceOf(entries, a).toLocaleString()}</td></tr>`).join('')}</table>`} />
          <ExportCsvButton name="chart-of-accounts" header={['code', 'name', 'type', 'group', 'active']} rows={() => state.accounts.map((a) => [a.code, a.name, a.type, a.group, a.active === false ? 'no' : 'yes'])} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => edit(null)}>
            <Plus size={14} /> Account
          </button>
        </>
      }
    >
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
                          {a.active === false && <span className="sx-tag">Inactive</span>}
                          {a.statistical && <span className="sx-tag">Statistical</span>}
                          <span className="fx-row-actions" style={{ marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="sx-link" onClick={() => edit(a)}>
                              Edit
                            </button>
                            <button type="button" className="sx-link" onClick={() => f.setAccountActive(a.code, a.active === false)}>
                              {a.active === false ? 'Activate' : 'Deactivate'}
                            </button>
                          </span>
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
      {prompt.node}
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
