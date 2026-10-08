import React, { useMemo, useState } from 'react';
import { AlertTriangle, BookPlus, BookmarkPlus, Plus, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { BOOK_CATEGORIES, LOAN_DAYS, daysBetween, plusDays, type LibraryBook, type LibraryLoan } from '../../../data/registersSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, fmt, kes, useRegOrg } from './shared';

const LOAN_FILTERS = ['On loan', 'Overdue', 'Returned', 'Lost', 'All'] as const;

/** Learning › Library: book catalogue with stock, loans and returns, renewals, reservations and lost-copy charges. */
export const LibraryTab: React.FC = () => {
  const { libraryBooks, libraryLoans, libraryReservations, returnBook, renewLoan, cancelReservation, setBookCopies, payrollOpenPeriod } = useApp();
  const { orgId, today, name, staff } = useRegOrg();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loanFilter, setLoanFilter] = useState<(typeof LOAN_FILTERS)[number]>('On loan');
  const [issuing, setIssuing] = useState<{ book?: LibraryBook; reserve?: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [lost, setLost] = useState<LibraryLoan | null>(null);

  const books = useMemo(() => libraryBooks.filter((b) => b.orgId === orgId), [libraryBooks, orgId]);
  const loans = useMemo(() => libraryLoans.filter((l) => l.orgId === orgId), [libraryLoans, orgId]);
  const queue = useMemo(() => libraryReservations.filter((r) => r.orgId === orgId && r.status === 'Waiting').sort((a, b) => a.on.localeCompare(b.on)), [libraryReservations, orgId]);
  const bookOf = useMemo(() => new Map(libraryBooks.map((b) => [b.id, b])), [libraryBooks]);
  const out = (bookId: string) => loans.filter((l) => l.bookId === bookId && l.status === 'On loan').length;
  const overdue = (l: LibraryLoan) => l.status === 'On loan' && l.dueOn < today;

  const q = search.trim().toLowerCase();
  const catalogue = books.filter((b) => (category === 'All' || b.category === category) && (!q || `${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(q))).sort((a, b) => a.title.localeCompare(b.title));
  const pgBooks = usePaged(catalogue, 10, `${q}|${category}|${orgId}`);

  const loanRows = loans
    .filter((l) => (loanFilter === 'All' ? true : loanFilter === 'Overdue' ? overdue(l) : l.status === loanFilter))
    .filter((l) => !q || `${bookOf.get(l.bookId)?.title ?? ''} ${name(l.staffId)} ${l.staffId}`.toLowerCase().includes(q))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const pgLoans = usePaged(loanRows, 10, `${loanFilter}|${q}|${orgId}`);

  const copies = books.reduce((n, b) => n + b.copies, 0);
  const onLoan = loans.filter((l) => l.status === 'On loan');
  const late = onLoan.filter(overdue);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Titles" value={books.length} sub={`${copies} copies in stock`} />
        <Stat label="On loan" value={onLoan.length} sub={`${copies - onLoan.length} copies on the shelf`} />
        <Stat label="Overdue" value={late.length} sub={late.length ? `Longest ${Math.max(...late.map((l) => daysBetween(l.dueOn, today)))} days late` : 'All loans in date'} tone={late.length ? 'var(--status-critical)' : undefined} />
        <Stat label="Reservations waiting" value={queue.length} sub={`${loans.filter((l) => l.status === 'Lost').length} copies lost to date`} />
      </div>

      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search title, author, ISBN or borrower..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          <button className="btn btn-primary btn-sm" onClick={() => setIssuing({})}>
            <BookPlus size={14} /> Issue book
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add title
          </button>
        </div>
      </div>

      <Card title="Loans & returns" sub={`Loans run ${LOAN_DAYS} days and can be renewed once. A lost copy is written off stock and its replacement cost deducted through payroll.`}>
        <div className="digicraft-filter-pills" style={{ marginBottom: 10 }}>
          {LOAN_FILTERS.map((k) => (
            <button key={k} className={`digicraft-filter-pill ${loanFilter === k ? 'active' : ''}`} onClick={() => setLoanFilter(k)}>
              {k}
              {k === 'Overdue' && late.length > 0 ? ` (${late.length})` : ''}
            </button>
          ))}
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Borrower</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pgLoans.rows.length === 0 && <Empty cols={6}>No loans match.</Empty>}
              {pgLoans.rows.map((l) => {
                const b = bookOf.get(l.bookId);
                const isLate = overdue(l);
                return (
                  <tr key={l.id}>
                    <td className="hi-wrap">
                      <strong>{b?.title ?? l.bookId}</strong>
                      <div className="hi-sub">
                        {l.id} · shelf {b?.shelf ?? '—'}
                      </div>
                    </td>
                    <td>
                      {name(l.staffId)}
                      <div className="hi-sub">{l.staffId}</div>
                    </td>
                    <td className="hi-sub">{fmt(l.issuedOn)}</td>
                    <td style={isLate ? { color: 'var(--status-critical)', fontWeight: 600 } : undefined}>
                      {fmt(l.dueOn)}
                      {isLate && <div className="hi-sub">{daysBetween(l.dueOn, today)} days overdue</div>}
                      {l.renewed && <div className="hi-sub">Renewed once</div>}
                    </td>
                    <td>
                      {l.status === 'On loan' ? <Pill tone={isLate ? 'danger' : 'primary'}>{isLate ? 'Overdue' : 'On loan'}</Pill> : l.status === 'Returned' ? <Pill tone="success">Returned</Pill> : <Pill tone="warning">Lost</Pill>}
                      {l.returnedOn && <div className="hi-sub">{fmt(l.returnedOn)}</div>}
                      {l.status === 'Lost' && <div className="hi-sub">{l.charge ? `${kes(l.charge)} via payroll · ${l.chargeRef}` : 'Written off, no charge'}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l.status === 'On loan' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={() => returnBook(l.id)}>
                            <Undo2 size={13} /> Return
                          </button>{' '}
                          <button className="btn btn-secondary btn-sm" disabled={l.renewed} title={l.renewed ? 'Already renewed once' : `Extend by ${LOAN_DAYS} days`} onClick={() => renewLoan(l.id)}>
                            <RefreshCw size={13} /> Renew
                          </button>{' '}
                          <button className="btn btn-secondary btn-sm" title="Mark lost" onClick={() => setLost(l)}>
                            <AlertTriangle size={13} /> Lost
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pgLoans} noun="loans" sizes={[10, 25, 50]} />
      </Card>

      <Card title="Catalogue & stock" sub="Available = copies held less copies on loan. Reserve a title when every copy is out.">
        <div className="digicraft-filter-pills" style={{ marginBottom: 10 }}>
          {['All', ...BOOK_CATEGORIES].map((c) => (
            <button key={c} className={`digicraft-filter-pill ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>ISBN</th>
                <th>Category</th>
                <th>Shelf</th>
                <th>Copies</th>
                <th>On loan</th>
                <th>Available</th>
                <th>Queue</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pgBooks.rows.length === 0 && <Empty cols={9}>No titles match.</Empty>}
              {pgBooks.rows.map((b) => {
                const o = out(b.id);
                const avail = b.copies - o;
                const waiting = queue.filter((r) => r.bookId === b.id).length;
                return (
                  <tr key={b.id}>
                    <td className="hi-wrap">
                      <strong>{b.title}</strong>
                      <div className="hi-sub">{b.author}</div>
                    </td>
                    <td className="hi-mono">{b.isbn}</td>
                    <td>{b.category}</td>
                    <td>{b.shelf}</td>
                    <td>
                      <input
                        className="form-control"
                        type="number"
                        min={o}
                        style={{ width: 70 }}
                        value={b.copies}
                        aria-label={`Copies of ${b.title}`}
                        onChange={(e) => e.target.value !== '' && setBookCopies(b.id, Math.max(0, Number(e.target.value)))}
                      />
                    </td>
                    <td>{o}</td>
                    <td>
                      <Pill tone={avail > 0 ? 'success' : 'warning'}>{avail}</Pill>
                    </td>
                    <td>{waiting || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {avail > 0 ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setIssuing({ book: b })}>
                          <BookPlus size={13} /> Issue
                        </button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setIssuing({ book: b, reserve: true })}>
                          <BookmarkPlus size={13} /> Reserve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pgBooks} noun="titles" sizes={[10, 25, 50]} />
      </Card>

      <Card title="Reservations queue" sub="First come, first served. Issuing the book to the person in the queue fulfils the reservation.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Reserved by</th>
                <th>On</th>
                <th>Available now</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && <Empty cols={5}>Nobody is waiting for a book.</Empty>}
              {queue.map((r) => {
                const b = bookOf.get(r.bookId);
                const avail = b ? b.copies - out(b.id) : 0;
                return (
                  <tr key={r.id}>
                    <td>{b?.title ?? r.bookId}</td>
                    <td>{name(r.staffId)}</td>
                    <td className="hi-sub">{fmt(r.on)}</td>
                    <td>{avail > 0 ? <Pill tone="success">Yes — {avail}</Pill> : <Pill tone="warning">All out</Pill>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {avail > 0 && b && <IssueNow book={b} staffId={r.staffId} />}{' '}
                      <button className="btn btn-secondary btn-sm" title="Cancel reservation" aria-label="Cancel reservation" onClick={() => cancelReservation(r.id)}>
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {issuing && <IssueModal books={books} staff={staff} initial={issuing.book} reserve={issuing.reserve} onClose={() => setIssuing(null)} />}
      {adding && <AddBookModal onClose={() => setAdding(false)} />}
      {lost && (
        <LostModal
          loan={lost}
          book={bookOf.get(lost.bookId)}
          borrower={name(lost.staffId)}
          period={payrollOpenPeriod.label}
          onClose={() => setLost(null)}
        />
      )}
    </>
  );
};

const IssueNow: React.FC<{ book: LibraryBook; staffId: string }> = ({ book, staffId }) => {
  const { issueBook } = useApp();
  return (
    <button className="btn btn-primary btn-sm" onClick={() => issueBook(book.id, staffId)}>
      <BookPlus size={13} /> Issue
    </button>
  );
};

const IssueModal: React.FC<{ books: LibraryBook[]; staff: ReturnType<typeof useRegOrg>['staff']; initial?: LibraryBook; reserve?: boolean; onClose: () => void }> = ({ books, staff, initial, reserve, onClose }) => {
  const { issueBook, reserveBook } = useApp();
  const { today } = useRegOrg();
  const [bookId, setBookId] = useState(initial?.id ?? '');
  const [staffId, setStaffId] = useState('');
  const [days, setDays] = useState(String(LOAN_DAYS));
  return (
    <Modal
      title={reserve ? 'Reserve book' : 'Issue book'}
      subtitle={reserve ? 'All copies are on loan. The borrower joins the queue.' : `Due back ${fmt(plusDays(today, Number(days) || LOAN_DAYS))}`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!bookId || !staffId}
            onClick={() => {
              if (reserve) {
                reserveBook(bookId, staffId);
                onClose();
              } else if (issueBook(bookId, staffId, Number(days) || LOAN_DAYS)) onClose();
            }}
          >
            {reserve ? 'Reserve' : 'Issue'}
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Book" wide>
          <select className="form-control" value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Choose a title</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Borrower">
          <PersonSelect value={staffId} onChange={setStaffId} people={staff} />
        </Field>
        {!reserve && (
          <Field label="Loan days" hint={`Default ${LOAN_DAYS}`}>
            <input className="form-control" type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
};

const LostModal: React.FC<{ loan: LibraryLoan; book?: LibraryBook; borrower: string; period: string; onClose: () => void }> = ({ loan, book, borrower, period, onClose }) => {
  const { markBookLost } = useApp();
  const [charge, setCharge] = useState(String(book?.price ?? 0));
  return (
    <Modal
      title="Mark copy as lost"
      subtitle={`${book?.title ?? loan.bookId} · borrowed by ${borrower}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              markBookLost(loan.id, Math.max(0, Number(charge) || 0));
              onClose();
            }}
          >
            Write off{Number(charge) > 0 ? ' and charge' : ''}
          </button>
        </>
      }
    >
      <Field label="Charge to borrower (KES)" hint="Replacement cost by default. Set 0 to write off without a charge." wide>
        <input className="form-control" type="number" min={0} value={charge} onChange={(e) => setCharge(e.target.value)} />
      </Field>
      <div className="pr-note">
        The copy leaves stock. {Number(charge) > 0 ? `${kes(Number(charge))} is posted as an Other deduction on ${borrower}'s ${period} payslip, reference LIB-LOST-${loan.id}.` : 'No pay item is posted.'}
      </div>
    </Modal>
  );
};

const AddBookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addBook } = useApp();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [category, setCategory] = useState<string>(BOOK_CATEGORIES[0]);
  const [copies, setCopies] = useState('1');
  const [shelf, setShelf] = useState('');
  const [price, setPrice] = useState('0');
  const ok = title.trim() && author.trim() && Number(copies) > 0 && shelf.trim();
  return (
    <Modal
      title="Add title to the catalogue"
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              addBook({ title: title.trim(), author: author.trim(), isbn: isbn.trim() || '—', category, copies: Number(copies), shelf: shelf.trim(), price: Number(price) || 0 });
              onClose();
            }}
          >
            Add title
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Title" wide>
          <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Author">
          <input className="form-control" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <Field label="ISBN">
          <input className="form-control" value={isbn} onChange={(e) => setIsbn(e.target.value)} />
        </Field>
        <Field label="Category">
          <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
            {BOOK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Copies">
          <input className="form-control" type="number" min={1} value={copies} onChange={(e) => setCopies(e.target.value)} />
        </Field>
        <Field label="Location / shelf">
          <input className="form-control" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. B2" />
        </Field>
        <Field label="Replacement cost (KES)" hint="Charged if a copy is lost">
          <input className="form-control" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
