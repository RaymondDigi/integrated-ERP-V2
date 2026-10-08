import React, { useMemo, useState } from 'react';
import { Wand2, Link2, Unlink, Landmark, CheckCircle2, AlertTriangle, ArrowDownLeft, ArrowUpRight, FilePlus2, Scale } from 'lucide-react';
import { useFinance } from '../store';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY } from '../engine';
import { Chips, Empty, Panel, Pill, Stat, SuitePage } from '../../ui/kit';
import { AccountSelect, useLookups } from '../parts';
import { ImportCsvButton } from '../../../platform/Widgets';

const SINCE = addDays(TODAY, -35);

export const BankPage: React.FC = () => {
  const { state, entries, autoMatch, matchBank, bankEntry, reconciliationFor, importStatement } = useFinance();
  const { accountLabel } = useLookups();
  const banks = state.accounts.filter((a) => a.bank);
  const [account, setAccount] = useState('1000');
  const [view, setView] = useState<'OPEN' | 'ALL'>('OPEN');
  const [selected, setSelected] = useState<string | null>(null);
  const [entryAccount, setEntryAccount] = useState('6900');
  const [memo, setMemo] = useState('');

  const rec = reconciliationFor(account, SINCE);
  const lines = rec.lines.filter((l) => view === 'ALL' || !l.matchedTo).sort((a, b) => b.date.localeCompare(a.date));
  const line = rec.lines.find((l) => l.id === selected) ?? null;
  const matchedIds = new Set(rec.lines.filter((l) => l.matchedTo).map((l) => l.matchedTo));

  // Ledger items that could be this statement line: same amount first, then close dates
  const suggestions = useMemo(() => {
    if (!line) return [];
    return rec.book
      .filter((e) => !matchedIds.has(e.id) && e.date >= addDays(SINCE, -10))
      .map((e) => ({ e, score: (Math.abs(e.amount - line.amount) < 0.005 ? 0 : 1000) + Math.abs(daysBetween(e.date, line.date)) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [line, rec.book, matchedIds]);

  const choose = (id: string) => {
    setSelected(id);
    // On narrow screens the match panel sits below the statement
    if (window.innerWidth < 1100) requestAnimationFrame(() => document.querySelector('.sx-match-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    const l = rec.lines.find((x) => x.id === id);
    if (!l) return;
    const d = l.description.toLowerCase();
    setEntryAccount(d.includes('interest') ? '4100' : d.includes('loan') ? '2500' : d.includes('m-pesa') || d.includes('c2b') ? '4100' : '6900');
    setMemo(l.description);
  };
  const entryOf = (id?: string) => (id ? entries.find((e) => e.id === id) : undefined);

  return (
    <SuitePage
      eyebrow="Cash & bank"
      title="Bank reconciliation"
      subtitle="Tick off the bank statement against the ledger. Book charges and standing orders straight from the statement."
      actions={
        <>
          <ImportCsvButton
            label="Import statement"
            template={['date', 'description', 'reference', 'amount']}
            onImport={(rows) => {
              const r = importStatement(account, rows);
              return r.ok ? { imported: rows.length, errors: [] } : { imported: 0, errors: [(r as { error: string }).error] };
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => autoMatch(account)}>
            <Wand2 size={15} /> Auto-match
          </button>
        </>
      }
    >
      <div className="sx-tabs">
        {banks.map((b) => {
          const r = reconciliationFor(b.code, SINCE);
          return (
            <button key={b.code} type="button" className={account === b.code ? 'active' : ''} onClick={() => (setAccount(b.code), setSelected(null))}>
              <Landmark size={15} />
              <span>
                <b>{b.name}</b>
                <small>
                  {kes(r.bookBalance, { compact: true })} · {!r.lines.length ? 'no statement yet' : r.unrecorded.length ? `${r.unrecorded.length} to match` : 'reconciled'}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sx-stats">
        <Stat label="Balance per books" value={kes(rec.bookBalance, { compact: true })} detail={accountLabel(account)} icon={<Scale size={17} />} />
        <Stat label="Balance per statement" value={kes(rec.statementBalance, { compact: true })} detail={`Statement to ${fmtDate(TODAY)}`} icon={<Landmark size={17} />} tone="blue" />
        <Stat
          label="Statement lines to match"
          value={rec.unrecorded.length}
          detail={`${rec.matchedCount} of ${rec.lines.length} matched`}
          icon={rec.unrecorded.length ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
          tone={rec.unrecorded.length ? 'gold' : 'green'}
        />
        <Stat label="Not yet on the statement" value={rec.uncleared.length} detail={`${kes(round2(rec.uncleared.reduce((s, e) => s + e.amount, 0)), { compact: true, sign: true })} in transit`} icon={<ArrowUpRight size={17} />} tone="violet" />
      </div>

      <div className="sx-split">
        <Panel
          title="Bank statement"
          subtitle="Select a line to match or book it"
          flush
          action={
            <Chips
              value={view}
              onChange={setView}
              options={[
                { value: 'OPEN', label: 'To match', count: rec.unrecorded.length },
                { value: 'ALL', label: 'All', count: rec.lines.length }
              ]}
            />
          }
        >
          {rec.lines.length === 0 ? (
            <Empty icon={<Landmark size={20} />} title="No statement imported yet" text="Import a CSV statement (date, description, reference, amount) or wait for the next bank feed." />
          ) : lines.length === 0 ? (
            <Empty icon={<CheckCircle2 size={20} />} title="Statement fully reconciled" text="Every line on the statement is matched to the ledger." />
          ) : (
            <ul className="sx-bank-list">
              {lines.map((l) => {
                const matched = entryOf(l.matchedTo);
                return (
                  <li key={l.id}>
                    <button type="button" className={`${selected === l.id ? 'selected' : ''}`} onClick={() => choose(l.id)}>
                      <span className={`sx-flow ${l.amount > 0 ? 'in' : 'out'}`}>{l.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span>
                      <span className="sx-bank-text">
                        <b>{l.description}</b>
                        <small>
                          {fmtDate(l.date)} · {l.reference}
                          {matched && ` · matched to ${matched.ref}`}
                        </small>
                      </span>
                      <b className={l.amount > 0 ? 'sx-success-text' : ''}>{kes(l.amount, { sign: true })}</b>
                      <Pill status={l.matchedTo ? 'MATCHED' : 'UNMATCHED'} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          className="sx-match-panel"
          title={line ? 'Match this line' : 'Ledger items not yet on the statement'} subtitle={line ? `${line.description} · ${kes(line.amount, { sign: true })}` : 'Payments not yet cleared and deposits in transit'}>
          {line ? (
            line.matchedTo ? (
              <div className="sx-match-done">
                <CheckCircle2 size={22} />
                <p>
                  Matched to <b>{entryOf(line.matchedTo)?.ref}</b> — {entryOf(line.matchedTo)?.memo}
                </p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => matchBank(line.id, undefined)}>
                  <Unlink size={14} /> Unmatch
                </button>
              </div>
            ) : (
              <>
                <h4 className="sx-subhead">Suggested ledger items</h4>
                {suggestions.length ? (
                  <ul className="sx-suggest">
                    {suggestions.map(({ e }) => {
                      const exact = Math.abs(e.amount - line.amount) < 0.005;
                      return (
                        <li key={e.id} className={exact ? 'exact' : ''}>
                          <div>
                            <b>{e.ref}</b>
                            <small>
                              {fmtDate(e.date)} · {e.source} · {e.memo}
                            </small>
                          </div>
                          <b>{kes(e.amount, { sign: true })}</b>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => (matchBank(line.id, e.id), setSelected(null))}>
                            <Link2 size={14} /> Match
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="sx-note">No open ledger items on this account.</p>
                )}
                <h4 className="sx-subhead">Or book it from the statement</h4>
                <p className="sx-note">For items the bank recorded first — charges, interest, standing orders, unidentified deposits.</p>
                <div className="sx-grid sx-grid-2">
                  <label className="req-field">
                    <span>{line.amount < 0 ? 'Charge to account' : 'Credit to account'}</span>
                    <AccountSelect value={entryAccount} onChange={setEntryAccount} filter={(c) => !['1100', '2000', '1150', '2100', account].includes(c)} />
                  </label>
                  <label className="req-field">
                    <span>Description</span>
                    <input className="form-control" value={memo} onChange={(e) => setMemo(e.target.value)} />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm sx-mt"
                  onClick={() => {
                    if (bankEntry(line.id, entryAccount, memo).ok) setSelected(null);
                  }}
                >
                  <FilePlus2 size={14} /> Post entry and match
                </button>
              </>
            )
          ) : rec.uncleared.length ? (
            <ul className="sx-list">
              {rec.uncleared.map((e) => (
                <li key={e.id}>
                  <span className="sx-mono">{e.ref}</span>
                  <span>{fmtDate(e.date)}</span>
                  <span className="sx-muted">{e.memo}</span>
                  <b>{kes(e.amount, { sign: true })}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sx-note">Everything in the ledger has reached the bank.</p>
          )}
        </Panel>
      </div>
    </SuitePage>
  );
};
