import React, { useMemo, useState } from 'react';
import { LogIn, LogOut, Search, Siren, UserPlus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { isOverstay, maskId, minutesBetween, visitorStatus, type Visitor, type VisitorStatus } from '../../../data/securitySeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, fmt, fmtStamp, useNow, useSecOrg, type Tone } from './shared';

const FILTERS = ['On site', 'Expected', 'Overstays', 'Left', 'All'] as const;
type Filter = (typeof FILTERS)[number];
const TONE: Record<VisitorStatus, Tone> = { 'On site': 'success', Expected: 'info', Left: 'primary', 'No show': 'warning' };

const hrs = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`);

/** Visitor and contractor log: pre-registration, check-in with badge, PPE and induction, check-out, overstays and the evacuation list. */
export const VisitorsCard: React.FC = () => {
  const { visitors, checkOutVisitor } = useApp();
  const { orgId, today, name } = useSecOrg();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('On site');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Visitor | null>(null);
  const [evac, setEvac] = useState(false);

  const mine = useMemo(() => visitors.filter((v) => v.orgId === orgId), [visitors, orgId]);
  const q = search.trim().toLowerCase();
  const rows = mine
    .filter((v) => {
      const s = visitorStatus(v, today);
      const f =
        filter === 'All' ||
        (filter === 'Overstays' ? isOverstay(v, now) : filter === 'Expected' ? s === 'Expected' : filter === 'Left' ? s === 'Left' || s === 'No show' : s === 'On site');
      return f && (!q || `${v.name} ${v.company} ${v.purpose} ${v.badgeNo ?? ''} ${v.vehicleReg ?? ''} ${name(v.hostId)}`.toLowerCase().includes(q));
    })
    .sort((a, b) => (b.checkIn ?? b.expectedOn).localeCompare(a.checkIn ?? a.expectedOn));
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);
  const count = (f: Filter) => (f === 'Overstays' ? mine.filter((v) => isOverstay(v, now)).length : f === 'On site' ? mine.filter((v) => v.checkIn && !v.checkOut).length : f === 'Expected' ? mine.filter((v) => visitorStatus(v, today) === 'Expected').length : null);

  return (
    <Card
      title="Visitor & contractor log"
      sub="Pre-registered and walk-in visitors. ID numbers are stored masked. Contractors need the safety induction before going past reception."
      actions={
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setEvac(true)}>
            <Siren size={14} /> Evacuation list
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <UserPlus size={14} /> Register visitor
          </button>
        </>
      }
    >
      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search name, company, host, badge..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          {FILTERS.map((k) => {
            const n = count(k);
            return (
              <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                {k}
                {n !== null ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Visitor</th>
              <th>ID no.</th>
              <th>Host / purpose</th>
              <th>Badge / vehicle</th>
              <th>Safety</th>
              <th>In / out</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={8}>No visitors match.</Empty>}
            {pg.rows.map((v) => {
              const s = visitorStatus(v, today);
              const over = isOverstay(v, now);
              return (
                <tr key={v.id}>
                  <td>
                    <strong>{v.name}</strong>
                    <div className="hi-sub">
                      {v.kind} · {v.company}
                    </div>
                  </td>
                  <td className="hi-mono">{v.idMasked}</td>
                  <td className="hi-wrap">
                    {name(v.hostId)}
                    <div className="hi-sub">{v.purpose}</div>
                  </td>
                  <td>
                    {v.badgeNo ?? '—'}
                    <div className="hi-sub">{v.vehicleReg ?? 'On foot'}</div>
                  </td>
                  <td>
                    <div className="hi-sub">PPE {v.ppeIssued ? 'issued' : 'not issued'}</div>
                    <div className="hi-sub" style={!v.inductionDone && v.checkIn && !v.checkOut ? { color: 'var(--status-critical)' } : undefined}>
                      Induction {v.inductionDone ? 'done' : 'not done'}
                    </div>
                  </td>
                  <td>
                    {v.checkIn ? fmtStamp(v.checkIn) : <span className="hi-sub">{v.preRegistered ? `Pre-registered for ${fmt(v.expectedOn)}` : '—'}</span>}
                    <div className="hi-sub">{v.checkOut ? `Out ${fmtStamp(v.checkOut)}` : `Expected out ${fmtStamp(v.expectedOut)}`}</div>
                  </td>
                  <td>
                    <Pill tone={over ? 'danger' : TONE[s]}>{over ? 'Overstay' : s}</Pill>
                    {over && <div className="hi-sub">{hrs(minutesBetween(v.expectedOut, now))} over</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {s === 'Expected' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setCheckingIn(v)}>
                        <LogIn size={13} /> Check in
                      </button>
                    )}
                    {s === 'On site' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => checkOutVisitor(v.id)}>
                        <LogOut size={13} /> Check out
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="visitors" sizes={[10, 25, 50]} />

      {adding && <RegisterModal onClose={() => setAdding(false)} />}
      {checkingIn && <CheckInModal visitor={checkingIn} onClose={() => setCheckingIn(null)} />}
      {evac && <EvacuationModal onClose={() => setEvac(false)} />}
    </Card>
  );
};

const RegisterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { registerVisitor } = useApp();
  const { staff, today } = useSecOrg();
  const [walkIn, setWalkIn] = useState(true);
  const [kind, setKind] = useState<Visitor['kind']>('Visitor');
  const [nm, setNm] = useState('');
  const [idNo, setIdNo] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [hostId, setHostId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expectedOn, setExpectedOn] = useState(today);
  const [outAt, setOutAt] = useState('17:00');
  const [badgeNo, setBadgeNo] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [ppeIssued, setPpe] = useState(false);
  const [inductionDone, setInduction] = useState(false);
  const day = walkIn ? today : expectedOn;
  const ok = nm.trim() && idNo.trim().length >= 5 && hostId && purpose.trim() && (!walkIn || badgeNo.trim()) && (!walkIn || kind === 'Visitor' || inductionDone);
  return (
    <Modal
      title="Register visitor"
      subtitle="Walk-ins are checked in now; pre-registered visitors are checked in when they arrive."
      onClose={onClose}
      width={780}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              registerVisitor(
                {
                  kind,
                  name: nm.trim(),
                  idMasked: maskId(idNo),
                  company: company.trim() || 'Private',
                  phone: phone.trim() ? `${phone.trim().slice(0, 8)} *** ${phone.trim().slice(-3)}` : '—',
                  hostId,
                  purpose: purpose.trim(),
                  preRegistered: !walkIn,
                  expectedOn: day,
                  expectedOut: `${day}T${outAt}`,
                  badgeNo: walkIn ? badgeNo.trim() : undefined,
                  vehicleReg: vehicleReg.trim() || undefined,
                  ppeIssued: walkIn && ppeIssued,
                  inductionDone: walkIn && inductionDone
                },
                walkIn
              );
              onClose();
            }}
          >
            {walkIn ? 'Check in now' : 'Pre-register'}
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Arrival">
          <select className="form-control" value={walkIn ? 'walk' : 'pre'} onChange={(e) => setWalkIn(e.target.value === 'walk')}>
            <option value="walk">Walk-in (at the gate now)</option>
            <option value="pre">Pre-register for later</option>
          </select>
        </Field>
        <Field label="Type">
          <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as Visitor['kind'])}>
            <option>Visitor</option>
            <option>Contractor</option>
          </select>
        </Field>
        <Field label="Full name">
          <input className="form-control" value={nm} onChange={(e) => setNm(e.target.value)} />
        </Field>
        <Field label="ID / passport no." hint="Only a masked copy is kept">
          <input className="form-control" value={idNo} onChange={(e) => setIdNo(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Company">
          <input className="form-control" value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Host employee">
          <PersonSelect value={hostId} onChange={setHostId} people={staff} />
        </Field>
        <Field label="Purpose">
          <input className="form-control" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
        {!walkIn && (
          <Field label="Expected on">
            <input className="form-control" type="date" min={today} value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
          </Field>
        )}
        <Field label="Expected to leave by" hint="Later than this is flagged as an overstay">
          <input className="form-control" type="time" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
        </Field>
        <Field label="Vehicle registration">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="Blank if on foot" />
        </Field>
        {walkIn && (
          <>
            <Field label="Badge no.">
              <input className="form-control" value={badgeNo} onChange={(e) => setBadgeNo(e.target.value)} placeholder={kind === 'Contractor' ? 'C-…' : 'V-…'} />
            </Field>
            <Field label="PPE issued">
              <select className="form-control" value={ppeIssued ? 'yes' : 'no'} onChange={(e) => setPpe(e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Safety induction done" hint={kind === 'Contractor' ? 'Required for contractors' : undefined}>
              <select className="form-control" value={inductionDone ? 'yes' : 'no'} onChange={(e) => setInduction(e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
};

const CheckInModal: React.FC<{ visitor: Visitor; onClose: () => void }> = ({ visitor: v, onClose }) => {
  const { checkInVisitor, addToast } = useApp();
  const { name } = useSecOrg();
  const [badgeNo, setBadgeNo] = useState('');
  const [vehicleReg, setVehicleReg] = useState(v.vehicleReg ?? '');
  const [ppeIssued, setPpe] = useState(v.kind === 'Contractor');
  const [inductionDone, setInduction] = useState(false);
  const ok = badgeNo.trim() && (v.kind === 'Visitor' || inductionDone);
  return (
    <Modal
      title={`Check in ${v.name}`}
      subtitle={`${v.company} · host ${name(v.hostId)} · ${v.purpose}`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              checkInVisitor(v.id, { badgeNo: badgeNo.trim(), vehicleReg: vehicleReg.trim() || undefined, ppeIssued, inductionDone });
              addToast({ type: 'success', title: 'Checked in', message: `${v.name}, badge ${badgeNo.trim()}. ${name(v.hostId)} has been told.` });
              onClose();
            }}
          >
            <LogIn size={14} /> Check in
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Badge no.">
          <input className="form-control" value={badgeNo} onChange={(e) => setBadgeNo(e.target.value)} placeholder={v.kind === 'Contractor' ? 'C-…' : 'V-…'} />
        </Field>
        <Field label="Vehicle registration">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />
        </Field>
        <Field label="PPE issued">
          <select className="form-control" value={ppeIssued ? 'yes' : 'no'} onChange={(e) => setPpe(e.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="Safety induction done" hint={v.kind === 'Contractor' ? 'Contractors cannot be checked in without it' : undefined}>
          <select className="form-control" value={inductionDone ? 'yes' : 'no'} onChange={(e) => setInduction(e.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
};

const EvacuationModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { visitors } = useApp();
  const { orgId, name, company, site } = useSecOrg();
  const now = useNow();
  const onSite = visitors.filter((v) => v.orgId === orgId && v.checkIn && !v.checkOut).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const section = (kind: Visitor['kind']) => ({
    heading: kind === 'Visitor' ? 'Visitors' : 'Contractors',
    columns: [{ label: 'Name' }, { label: 'Company' }, { label: 'Badge' }, { label: 'Host' }, { label: 'Checked in' }, { label: 'Phone' }, { label: 'At assembly point' }],
    rows: onSite.filter((v) => v.kind === kind).map((v) => [v.name, v.company, v.badgeNo ?? '—', name(v.hostId), fmtStamp(v.checkIn), v.phone, '☐'])
  });
  const report: Report = {
    title: 'Evacuation list — visitors and contractors on site',
    subtitle: `${site} · as at ${fmtStamp(now)}`,
    kpis: [
      { label: 'Visitors', value: String(onSite.filter((v) => v.kind === 'Visitor').length) },
      { label: 'Contractors', value: String(onSite.filter((v) => v.kind === 'Contractor').length) }
    ],
    sections: [section('Visitor'), section('Contractor')],
    footnote: 'Staff on duty are counted separately from the attendance roll. Tick each person at the assembly point and report anyone missing to the fire marshal.',
    signatures: ['Roll call by (guard)', 'Fire marshal']
  };
  return (
    <Modal title="Evacuation list" subtitle={`${onSite.length} people on site now`} onClose={onClose} width={960}>
      <ReportPaper report={report} company={company} preparedBy="Gate security" />
    </Modal>
  );
};
