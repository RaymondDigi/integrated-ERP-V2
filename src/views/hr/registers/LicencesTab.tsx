import React, { useMemo, useState } from 'react';
import { History, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { LICENCE_TYPES, daysBetween, licenceStatus, plusDays, type Licence, type LicenceStatus } from '../../../data/registersSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, fmt, kes, useRegOrg, type Tone } from './shared';
import { AuditsCard } from './AuditsCard';

const TONE: Record<LicenceStatus, Tone> = { Valid: 'success', 'Due for renewal': 'warning', Expired: 'danger', 'Renewal in progress': 'info' };
const FILTERS = ['All', 'Due for renewal', 'Expired', 'Renewal in progress', 'Valid'] as const;

/** OSH › Licences & Audits: statutory licences and permits with renewal tracking, plus external OSH audits. */
export const LicencesTab: React.FC = () => {
  const { licences, startLicenceRenewal, cancelLicenceRenewal } = useApp();
  const { orgId, today, name } = useRegOrg();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [renewing, setRenewing] = useState<Licence | null>(null);
  const [history, setHistory] = useState<Licence | null>(null);
  const [starting, setStarting] = useState<Licence | null>(null);
  const [note, setNote] = useState('');

  const mine = useMemo(() => licences.filter((l) => l.orgId === orgId).map((l) => ({ l, status: licenceStatus(l, today), days: daysBetween(today, l.expiresOn) })), [licences, orgId, today]);
  const q = search.trim().toLowerCase();
  const rows = mine
    .filter((r) => (filter === 'All' || r.status === filter) && (!q || `${r.l.type} ${r.l.number} ${r.l.authority} ${r.l.site}`.toLowerCase().includes(q)))
    .sort((a, b) => a.days - b.days);
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);
  const count = (s: LicenceStatus) => mine.filter((r) => r.status === s).length;
  const feesDue = mine.filter((r) => r.status === 'Due for renewal' || r.status === 'Expired').reduce((n, r) => n + r.l.fee, 0);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Licences & permits" value={mine.length} sub={`${count('Valid')} valid`} />
        <Stat label="Due for renewal" value={count('Due for renewal')} sub={`Fees about ${kes(feesDue)} incl. expired`} tone={count('Due for renewal') ? 'var(--status-warning)' : undefined} />
        <Stat label="Expired" value={count('Expired')} sub="Operating without a valid licence is an offence" tone={count('Expired') ? 'var(--status-critical)' : undefined} />
        <Stat label="Renewals in progress" value={count('Renewal in progress')} sub="Applications with the authority" />
      </div>

      {(count('Expired') > 0 || count('Due for renewal') > 0) && (
        <div className="pr-note warn" style={{ marginBottom: 12 }}>
          {mine
            .filter((r) => r.status === 'Expired' || r.status === 'Due for renewal')
            .map((r) => `${r.l.type} ${r.days < 0 ? `expired ${-r.days} days ago` : `expires in ${r.days} days`}`)
            .join(' · ')}
        </div>
      )}

      <Card
        title="Licence & permit register"
        sub="Every licence the company needs to operate, who looks after it and when it must be renewed. Alerts start the set number of days before expiry."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add licence
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search licence, number, authority or site..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {FILTERS.map((k) => (
              <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Licence</th>
                <th>Number</th>
                <th>Site</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Responsible</th>
                <th>Fee</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={9}>No licences match.</Empty>}
              {pg.rows.map(({ l, status, days }) => (
                <tr key={l.id}>
                  <td className="hi-wrap">
                    <strong>{l.type}</strong>
                    <div className="hi-sub">{l.authority}</div>
                  </td>
                  <td>
                    <div className="hi-mono">{l.number}</div>
                    <div className="hi-sub">{l.docRef}</div>
                  </td>
                  <td className="hi-wrap">{l.site}</td>
                  <td className="hi-sub">{fmt(l.issuedOn)}</td>
                  <td>
                    {fmt(l.expiresOn)}
                    <div className="hi-sub">{days < 0 ? `${-days} days ago` : `in ${days} days`} · alert {l.leadDays}d before</div>
                  </td>
                  <td>{name(l.officerId)}</td>
                  <td>{kes(l.fee)}</td>
                  <td>
                    <Pill tone={TONE[status]}>{status}</Pill>
                    {l.renewal && (
                      <div className="hi-sub" title={l.renewal.note}>
                        Since {fmt(l.renewal.startedOn)}
                        {l.renewal.note ? ` · ${l.renewal.note}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {l.renewal ? (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => setRenewing(l)}>
                          Renewed
                        </button>{' '}
                        <button className="btn btn-secondary btn-sm" title="Cancel renewal" aria-label="Cancel renewal" onClick={() => cancelLicenceRenewal(l.id)}>
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        className={`btn btn-sm ${status === 'Valid' ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => {
                          setStarting(l);
                          setNote('');
                        }}
                      >
                        <RefreshCw size={13} /> Start renewal
                      </button>
                    )}{' '}
                    <button className="btn btn-secondary btn-sm" title="Renewal history" aria-label="Renewal history" onClick={() => setHistory(l)}>
                      <History size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="licences" sizes={[10, 25, 50]} />
      </Card>

      <AuditsCard />

      {adding && <AddLicenceModal onClose={() => setAdding(false)} />}
      {starting && (
        <Modal
          title={`Start renewal — ${starting.type}`}
          subtitle={`${starting.number} · expires ${fmt(starting.expiresOn)}`}
          onClose={() => setStarting(null)}
          width={560}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setStarting(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  startLicenceRenewal(starting.id, note.trim());
                  setStarting(null);
                }}
              >
                Start renewal
              </button>
            </>
          }
        >
          <Field label="Note" hint="Application reference, inspection date or what is outstanding" wide>
            <textarea className="form-control" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
      {renewing && <RenewModal licence={renewing} onClose={() => setRenewing(null)} />}
      {history && (
        <Modal title={`Renewal history — ${history.type}`} subtitle={`${history.number} · ${history.site}`} onClose={() => setHistory(null)} width={680}>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Renewed</th>
                <th>Previous expiry</th>
                <th>New expiry</th>
                <th>Fee</th>
                <th>Receipt / reference</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {history.history.length === 0 && <Empty cols={6}>No renewals recorded yet. Current licence issued {fmt(history.issuedOn)}.</Empty>}
              {history.history.map((h) => (
                <tr key={`${h.renewedOn}-${h.reference}`}>
                  <td>{fmt(h.renewedOn)}</td>
                  <td className="hi-sub">{fmt(h.previousExpiry)}</td>
                  <td>{fmt(h.newExpiry)}</td>
                  <td>{kes(h.fee)}</td>
                  <td className="hi-mono">{h.reference}</td>
                  <td>{h.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
};

const RenewModal: React.FC<{ licence: Licence; onClose: () => void }> = ({ licence: l, onClose }) => {
  const { renewLicence } = useApp();
  const { today } = useRegOrg();
  const months = LICENCE_TYPES.find((t) => t.type === l.type)?.months ?? 12;
  const base = l.expiresOn > today ? l.expiresOn : today;
  // Next term runs on from the current expiry (or today if already lapsed)
  const d = new Date(`${base}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  const suggested = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [issuedOn, setIssuedOn] = useState(today);
  const [expiry, setExpiry] = useState(suggested);
  const [fee, setFee] = useState(String(l.fee));
  const [reference, setReference] = useState('');
  const [number, setNumber] = useState(l.number);
  const ok = expiry > issuedOn && reference.trim() && Number(fee) >= 0;
  return (
    <Modal
      title={`Record renewal — ${l.type}`}
      subtitle={`Current expiry ${fmt(l.expiresOn)} · ${l.authority}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              renewLicence(l.id, { issuedOn, newExpiry: expiry, fee: Number(fee), reference: reference.trim(), number });
              onClose();
            }}
          >
            Save renewal
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Licence number" hint="Change it if the authority issued a new number">
          <input className="form-control" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Receipt / reference">
          <input className="form-control" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. payment receipt no." />
        </Field>
        <Field label="Issued on">
          <input className="form-control" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </Field>
        <Field label="New expiry" hint={`Usually ${months} months`}>
          <input className="form-control" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Fee paid (KES)">
          <input className="form-control" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const AddLicenceModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addLicence, activeTenant } = useApp();
  const { staff, today } = useRegOrg();
  const [type, setType] = useState(LICENCE_TYPES[0].type);
  const def = LICENCE_TYPES.find((t) => t.type === type)!;
  const [authority, setAuthority] = useState(def.authority);
  const [number, setNumber] = useState('');
  const [site, setSite] = useState(activeTenant.name);
  const [issuedOn, setIssuedOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState(plusDays(today, 364));
  const [leadDays, setLeadDays] = useState(String(def.leadDays));
  const [officerId, setOfficerId] = useState('');
  const [fee, setFee] = useState('0');
  const [docRef, setDocRef] = useState('');
  const ok = number.trim() && authority.trim() && officerId && expiresOn > issuedOn;
  return (
    <Modal
      title="Add licence or permit"
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              addLicence({ type, authority, number: number.trim(), site, issuedOn, expiresOn, leadDays: Number(leadDays) || 30, officerId, fee: Number(fee) || 0, docRef: docRef.trim() || '—' });
              onClose();
            }}
          >
            Add to register
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Licence type">
          <select
            className="form-control"
            value={type}
            onChange={(e) => {
              const t = LICENCE_TYPES.find((x) => x.type === e.target.value)!;
              setType(t.type);
              setAuthority(t.authority);
              setLeadDays(String(t.leadDays));
            }}
          >
            {LICENCE_TYPES.map((t) => (
              <option key={t.type}>{t.type}</option>
            ))}
          </select>
        </Field>
        <Field label="Issuing authority">
          <input className="form-control" value={authority} onChange={(e) => setAuthority(e.target.value)} />
        </Field>
        <Field label="Licence number">
          <input className="form-control" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Site / branch">
          <input className="form-control" value={site} onChange={(e) => setSite(e.target.value)} />
        </Field>
        <Field label="Issued on">
          <input className="form-control" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </Field>
        <Field label="Expires on">
          <input className="form-control" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </Field>
        <Field label="Renewal alert (days before expiry)">
          <input className="form-control" type="number" min={0} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />
        </Field>
        <Field label="Fee (KES)">
          <input className="form-control" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Responsible officer">
          <PersonSelect value={officerId} onChange={setOfficerId} people={staff} />
        </Field>
        <Field label="Document reference" hint="Where the scanned licence is filed">
          <input className="form-control" value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="e.g. DMS/LIC/…" />
        </Field>
      </div>
    </Modal>
  );
};
