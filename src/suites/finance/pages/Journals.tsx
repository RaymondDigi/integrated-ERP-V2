import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Printer, Undo2, BookOpen, Scale, CheckCircle2, AlertTriangle, Cog } from 'lucide-react';
import { useFinance, type JournalDraft } from '../store';
import { fmtDate, JOURNAL_SOURCE, journalTotals, kes, round2, TODAY } from '../engine';
import { DEPARTMENTS } from '../data';
import type { Journal, JournalLine } from '../types';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Pill, SearchBox, Stat, SuitePage, type Column } from '../../ui/kit';
import { AccountSelect, PrintHeader, useLookups, WorkflowPanel } from '../parts';
import { printArea } from '../../../views/ess/EssRecords';

type Filter = 'ALL' | 'MANUAL' | 'APPROVAL' | 'SYSTEM';

export const JournalsPage: React.FC = () => {
  const { state, focus, setFocus } = useFinance();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Journal | 'new' | null>(null);

  useEffect(() => {
    if (focus === 'new') {
      setEditing('new');
      setFocus(null);
    } else if (focus && state.journals.some((j) => j.id === focus)) {
      setOpenId(focus);
      setFocus(null);
    }
  }, [focus, state.journals, setFocus]);

  const is = (j: Journal, f: Filter) =>
    f === 'ALL' || (f === 'MANUAL' && j.source === 'MANUAL') || (f === 'APPROVAL' && (j.status === 'SUBMITTED' || j.status === 'APPROVED' || j.status === 'DRAFT' || j.status === 'REJECTED')) || (f === 'SYSTEM' && j.source !== 'MANUAL');
  const rows = state.journals.filter((j) => is(j, filter)).filter((j) => !q || `${j.number} ${j.memo}`.toLowerCase().includes(q.toLowerCase()));
  const posted = state.journals.filter((j) => j.status === 'POSTED');

  const columns: Column<Journal>[] = [
    { key: 'number', header: 'Number', render: (j) => <b className="sx-mono">{j.number}</b>, sort: (j) => j.number, width: 130 },
    {
      key: 'memo',
      header: 'Description',
      render: (j) => (
        <div className="sx-cell-main">
          <span>{j.memo}</span>
          <small>
            {JOURNAL_SOURCE[j.source]}
            {j.reversedBy && ' · reversed'}
          </small>
        </div>
      ),
      sort: (j) => j.memo
    },
    { key: 'date', header: 'Date', render: (j) => fmtDate(j.date), sort: (j) => j.date },
    { key: 'amount', header: 'Amount', render: (j) => kes(journalTotals(j).debit), sort: (j) => journalTotals(j).debit, align: 'right' },
    { key: 'status', header: 'Status', render: (j) => <Pill status={j.status} />, sort: (j) => j.status }
  ];
  const open = state.journals.find((j) => j.id === openId) ?? null;

  return (
    <SuitePage
      eyebrow="General ledger"
      title="Journals"
      subtitle="Manual adjustments go through approval. System journals — payroll, depreciation, bank entries — are posted automatically."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New journal
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Posted this year" value={posted.filter((j) => j.date.slice(0, 4) === TODAY.slice(0, 4)).length} detail="All sources" icon={<BookOpen size={17} />} />
        <Stat label="Manual journals" value={state.journals.filter((j) => j.source === 'MANUAL').length} detail="Prepared by the finance team" icon={<Scale size={17} />} tone="blue" />
        <Stat label="Waiting" value={state.journals.filter((j) => is(j, 'APPROVAL')).length} detail="Drafts and journals in approval" icon={<AlertTriangle size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label="System journals" value={state.journals.filter((j) => j.source !== 'MANUAL').length} detail="Payroll, depreciation, bank, assets" icon={<Cog size={17} />} tone="violet" onClick={() => setFilter('SYSTEM')} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: state.journals.length },
            { value: 'APPROVAL', label: 'Needs action', count: state.journals.filter((j) => is(j, 'APPROVAL')).length },
            { value: 'MANUAL', label: 'Manual', count: state.journals.filter((j) => is(j, 'MANUAL')).length },
            { value: 'SYSTEM', label: 'System', count: state.journals.filter((j) => is(j, 'SYSTEM')).length }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search journals…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(j) => j.id} onRowClick={(j) => setOpenId(j.id)} selected={openId} initialSort={{ key: 'date', dir: 'desc' }} />
      {open && <JournalDrawer j={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} onOpen={setOpenId} />}
      {editing && (
        <JournalEditor
          journal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const JournalDrawer: React.FC<{ j: Journal; onClose: () => void; onEdit: () => void; onOpen: (id: string) => void }> = ({ j, onClose, onEdit, onOpen }) => {
  const { state, actor, reverseJournal } = useFinance();
  const { accountLabel } = useLookups();
  const [revDate, setRevDate] = useState(TODAY);
  const [reversing, setReversing] = useState(false);
  const t = journalTotals(j);
  const reversal = j.reversedBy ? state.journals.find((x) => x.id === j.reversedBy) : null;
  const original = j.reversalOf ? state.journals.find((x) => x.id === j.reversalOf) : null;
  const canReverse = j.status === 'POSTED' && !j.reversedBy && !j.reversalOf && actor.role !== 'ACCOUNTANT';
  return (
    <Drawer
      wide
      title={j.number}
      subtitle={`${j.memo} · ${fmtDate(j.date)}`}
      badge={<Pill status={j.status} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print journal voucher
          </button>
          <span className="sx-grow" />
          {canReverse && !reversing && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReversing(true)}>
              <Undo2 size={14} /> Reverse
            </button>
          )}
        </>
      }
    >
      {reversing && (
        <div className="sx-callout warn">
          <Undo2 size={16} />
          <div>
            <b>Reverse {j.number}</b>
            <span>A new journal with debits and credits swapped will be posted on the date you choose.</span>
            <div className="sx-inline-form">
              <input className="form-control" type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReversing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  const r = reverseJournal(j.id, revDate);
                  if (r.ok && r.id) onOpen(r.id);
                }}
              >
                Post reversal
              </button>
            </div>
          </div>
        </div>
      )}
      <DefList
        items={[
          ['Source', JOURNAL_SOURCE[j.source]],
          ['Date', fmtDate(j.date)],
          ['Total', kes(t.debit)],
          ['Prepared by', j.preparedBy]
        ]}
      />
      {reversal && (
        <p className="sx-note">
          Reversed by{' '}
          <button type="button" className="sx-link" onClick={() => onOpen(reversal.id)}>
            {reversal.number}
          </button>
        </p>
      )}
      {original && (
        <p className="sx-note">
          Reverses{' '}
          <button type="button" className="sx-link" onClick={() => onOpen(original.id)}>
            {original.number}
          </button>
        </p>
      )}
      <h4 className="sx-subhead">Lines</h4>
      <JournalLinesTable lines={j.lines} accountLabel={accountLabel} />
      {j.source === 'MANUAL' ? (
        <>
          <h4 className="sx-subhead">Approval</h4>
          <WorkflowPanel collection="journals" doc={j} onEdit={onEdit} />
        </>
      ) : (
        <p className="sx-note">
          <CheckCircle2 size={13} /> Posted automatically by {j.preparedBy === 'System' ? 'the system' : j.preparedBy}.
        </p>
      )}
      <article className="sx-print-only ess-print-area sx-paper">
        <PrintHeader title="Journal voucher" number={j.number} meta={[['Date', fmtDate(j.date)], ['Source', JOURNAL_SOURCE[j.source]]]} />
        <p className="sx-paper-memo">{j.memo}</p>
        <JournalLinesTable lines={j.lines} accountLabel={accountLabel} paper />
        <div className="sx-paper-foot">
          <div className="sx-paper-signs">
            <span>Prepared: {j.preparedBy}</span>
            {j.approvals.map((a) => (
              <span key={a.by}>Approved: {a.by}</span>
            ))}
          </div>
        </div>
      </article>
    </Drawer>
  );
};

const JournalLinesTable: React.FC<{ lines: JournalLine[]; accountLabel: (c: string) => string; paper?: boolean }> = ({ lines, accountLabel, paper }) => {
  const t = journalTotals({ lines });
  return (
    <table className={paper ? 'sx-paper-table' : 'sx-mini-table'}>
      <thead>
        <tr>
          <th>Account</th>
          <th className={paper ? '' : 'sx-hide-sm'}>Description</th>
          <th style={{ textAlign: 'right' }}>Debit</th>
          <th style={{ textAlign: 'right' }}>Credit</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <td>{accountLabel(l.account)}</td>
            <td className={paper ? '' : 'sx-hide-sm sx-muted'}>
              {l.description}
              {l.department && ` · ${l.department}`}
            </td>
            <td style={{ textAlign: 'right' }}>{l.debit ? l.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
            <td style={{ textAlign: 'right' }}>{l.credit ? l.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="sx-total-row">
          <td colSpan={2}>Totals</td>
          <td style={{ textAlign: 'right' }}>{t.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style={{ textAlign: 'right' }}>{t.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>
  );
};

const blank = (): JournalLine => ({ id: `n${Math.random().toString(36).slice(2, 8)}`, account: '', description: '', debit: 0, credit: 0 });

const JournalEditor: React.FC<{ journal: Journal | null; onClose: () => void; onSaved: (id: string) => void }> = ({ journal, onClose, onSaved }) => {
  const { state, saveJournal, transition } = useFinance();
  const [d, setD] = useState<JournalDraft>(() =>
    journal ? { id: journal.id, date: journal.date, memo: journal.memo, lines: journal.lines.map((l) => ({ ...l })) } : { date: TODAY, memo: '', lines: [blank(), blank()] }
  );
  const setLine = (id: string, patch: Partial<JournalLine>) => setD((x) => ({ ...x, lines: x.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const t = journalTotals(d);
  const diff = round2(t.debit - t.credit);
  const save = (submit: boolean) => {
    const r = saveJournal(d);
    if (!r.ok || !r.id) return;
    if (submit) transition('journals', r.id, 'submit');
    onSaved(r.id);
  };
  return (
    <Modal
      size="xl"
      title={journal ? `Edit ${journal.number}` : 'New journal'}
      subtitle="Debits must equal credits. Customer, supplier and VAT control accounts are posted through their own documents."
      onClose={onClose}
      footer={
        <>
          <span className={`sx-balance-flag ${t.balanced ? 'ok' : 'off'}`}>
            {t.balanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {t.balanced ? 'Balanced' : diff ? `Out by ${Math.abs(diff).toLocaleString()} (${diff > 0 ? 'more debits' : 'more credits'})` : 'Enter amounts'}
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(false)}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={!t.balanced}>
            Save & submit
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="What is this journal for?" required span={3}>
          <input className="form-control" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} placeholder="e.g. Accrue October electricity" autoFocus />
        </Field>
        <Field label="Date" required>
          <input className="form-control" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </Field>
        <Field label="Reason code">
          <select className="form-control" value={d.reasonCode ?? ''} onChange={(e) => setD({ ...d, reasonCode: e.target.value || undefined })} name="reasonCode">
            <option value="">None</option>
            {state.reasonCodes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} · {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reverse automatically on" hint="Accruals: reversed by the close run">
          <input className="form-control" type="date" value={d.autoReverseOn ?? ''} onChange={(e) => setD({ ...d, autoReverseOn: e.target.value || undefined })} name="autoReverseOn" />
        </Field>
        <Field label="Adjustment period">
          <select className="form-control" value={d.periodKey ?? ''} onChange={(e) => setD({ ...d, periodKey: e.target.value || undefined })} name="periodKey">
            <option value="">Normal period for the date</option>
            {state.periods
              .filter((p) => p.special && p.status === 'OPEN')
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label ?? p.key}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="sx-lines sx-jlines">
        <div className="sx-lines-head">
          <span>Account</span>
          <span>Description</span>
          <span>Department</span>
          <span>Debit</span>
          <span>Credit</span>
          <span />
        </div>
        {d.lines.map((l) => (
          <div key={l.id} className="sx-lines-row">
            <AccountSelect value={l.account} onChange={(v) => setLine(l.id, { account: v })} filter={(c) => !['1100', '2000', '1150', '2100'].includes(c)} />
            <input className="form-control" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label="Line description" />
            <select className="form-control" value={l.department ?? ''} onChange={(e) => setLine(l.id, { department: e.target.value || undefined })} aria-label="Department">
              <option value="">—</option>
              {DEPARTMENTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input className="form-control" type="number" min="0" value={l.debit || ''} placeholder="0" onChange={(e) => setLine(l.id, { debit: Number(e.target.value), credit: Number(e.target.value) ? 0 : l.credit })} aria-label="Debit" />
            <input className="form-control" type="number" min="0" value={l.credit || ''} placeholder="0" onChange={(e) => setLine(l.id, { credit: Number(e.target.value), debit: Number(e.target.value) ? 0 : l.debit })} aria-label="Credit" />
            <button type="button" className="sx-icon-btn" onClick={() => setD({ ...d, lines: d.lines.length > 2 ? d.lines.filter((x) => x.id !== l.id) : d.lines })} disabled={d.lines.length <= 2} aria-label="Remove line">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="sx-lines-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, lines: [...d.lines, blank()] })}>
            <Plus size={14} /> Add line
          </button>
          <span />
          <b>{t.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
          <b>{t.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
        </div>
      </div>
    </Modal>
  );
};
