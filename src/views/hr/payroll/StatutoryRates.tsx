import React, { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { PAYROLL_POLICY, rateTables, ratesOn, setRatesFrom, type StatutoryRateTable } from '../../../data/statutoryRates';
import { computeStatutory } from '../../../utils/statutory';
import { Modal } from './shared';
import { kes } from './reports';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pctv = (r: number) => `${+(r * 100).toFixed(3)}%`;

/**
 * Edit statutory rates from a date. The earliest date allowed is the start of the active payroll period, so paid
 * months never change. If a version already starts on that date it is updated; otherwise a new version is added
 * and the one before it closes the day before.
 */
const NewVersionModal: React.FC<{ onClose: () => void; onSaved: () => void; mode: 'edit' | 'new' }> = ({ onClose, onSaved, mode }) => {
  const { addToast, payrollOpenPeriod } = useApp();
  const openStart = `${payrollOpenPeriod.key}-01`;
  const [from, setFrom] = useState(mode === 'edit' ? openStart : '2027-02-01');
  const cur = ratesOn(from);
  const existing = rateTables().find((t) => t.effectiveFrom === from);
  const [label, setLabel] = useState(mode === 'edit' ? `Rates from ${payrollOpenPeriod.label}` : 'NSSF year 5 limits');
  const [source, setSource] = useState(mode === 'edit' ? 'Company payroll settings' : 'NSSF year 5 contribution notice (gazette pending)');
  const [v, setV] = useState({
    nssfRate: cur.nssf.rate * 100,
    insuranceCap: cur.paye.insuranceRelief.cap,
    pmfCap: cur.paye.pmfRelief.cap,
    housingRate: cur.paye.housingRelief.rate * 100,
    pensionMax: cur.pensionCap.max,
    mortgageCap: cur.mortgageInterestCap,
    deductionCap: cur.deductionCap * 100,
    lel: cur.nssf.lel,
    uel: cur.nssf.uel,
    shifRate: cur.shif.rate * 100,
    shifFloor: cur.shif.floor,
    ahlRate: cur.ahl.rate * 100,
    personalRelief: cur.paye.personalRelief,
    housingCap: cur.paye.housingRelief.cap,
    pwd: cur.paye.pwdExemptMonthly,
    secondary: cur.paye.secondaryRate * 100,
    nita: cur.nita,
    prescribed: cur.prescribedLoanRate * 100
  });
  const [bands, setBands] = useState(cur.paye.bands.map((b) => ({ upTo: b.upTo === Infinity ? '' : String(b.upTo), rate: String(b.rate * 100) })));
  const num = (k: keyof typeof v) => (
    <input className="form-control" type="number" value={v[k]} onChange={(ev) => setV((x) => ({ ...x, [k]: Number(ev.target.value) }))} />
  );
  const bandError = bands.some((b, i) => i < bands.length - 1 && (!(Number(b.upTo) > 0) || (i > 0 && Number(b.upTo) <= Number(bands[i - 1].upTo))));
  const error =
    from < openStart
      ? `Rates can change from ${payrollOpenPeriod.label} (${openStart}) onwards — paid months keep the rates they were paid with`
      : v.uel <= v.lel
        ? 'Upper limit must be above the lower limit'
        : bandError
          ? 'Band limits must rise from one band to the next; leave only the last band without a limit'
          : !(v.deductionCap > 0 && v.deductionCap <= 100)
            ? 'The deduction limit must be between 1% and 100%'
            : '';
  const save = () => {
    const values = (t: StatutoryRateTable): StatutoryRateTable => ({
      ...t,
      label,
      source,
      nssf: { lel: v.lel, uel: v.uel, rate: v.nssfRate / 100 },
      shif: { rate: v.shifRate / 100, floor: v.shifFloor },
      ahl: { rate: v.ahlRate / 100 },
      paye: {
        ...cur.paye,
        bands: bands.map((b) => ({ upTo: b.upTo ? Number(b.upTo) : Infinity, rate: Number(b.rate) / 100 })),
        personalRelief: v.personalRelief,
        housingRelief: { rate: v.housingRate / 100, cap: v.housingCap },
        insuranceRelief: { ...cur.paye.insuranceRelief, cap: v.insuranceCap },
        pmfRelief: { ...cur.paye.pmfRelief, cap: v.pmfCap },
        pwdExemptMonthly: v.pwd,
        secondaryRate: v.secondary / 100
      },
      pensionCap: { ...cur.pensionCap, max: v.pensionMax },
      mortgageInterestCap: v.mortgageCap,
      deductionCap: v.deductionCap / 100,
      nita: v.nita,
      prescribedLoanRate: v.prescribed / 100
    });
    const id = setRatesFrom(from, values);
    addToast({ type: 'success', title: existing ? 'Rates updated' : 'Rate version added', message: `${id} applies to payslips dated ${from} onwards. Earlier months are unchanged.` });
    onSaved();
    onClose();
  };
  return (
    <Modal
      title={mode === 'edit' ? 'Edit statutory rates' : 'New statutory rate version'}
      subtitle={
        existing
          ? `Updates version ${existing.id}, which starts on ${from}.`
          : `Adds a version from ${from}; ${cur.id} closes the day before. Values start as ${cur.id}'s. Earliest date: ${openStart} (start of the active period).`
      }
      onClose={onClose}
      width={820}
      footer={
        <>
          {error && <span className="req-error">{error}</span>}
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!!error} onClick={save}>
              {existing ? 'Save changes' : 'Add version'}
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Effective from</span>
          <input className="form-control" type="date" min={openStart} value={from} onChange={(ev) => setFrom(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Name</span>
          <input className="form-control" value={label} onChange={(ev) => setLabel(ev.target.value)} />
        </label>
        <label className="req-field wide">
          <span>Source (gazette / circular)</span>
          <input className="form-control" value={source} onChange={(ev) => setSource(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>NSSF lower earnings limit</span>
          {num('lel')}
        </label>
        <label className="req-field">
          <span>NSSF upper earnings limit</span>
          {num('uel')}
        </label>
        <label className="req-field">
          <span>SHIF rate (%)</span>
          {num('shifRate')}
        </label>
        <label className="req-field">
          <span>SHIF minimum (KES)</span>
          {num('shifFloor')}
        </label>
        <label className="req-field">
          <span>Housing levy rate (%, each share)</span>
          {num('ahlRate')}
        </label>
        <label className="req-field">
          <span>Personal relief (KES / month)</span>
          {num('personalRelief')}
        </label>
        <label className="req-field">
          <span>Housing relief cap (KES / month)</span>
          {num('housingCap')}
        </label>
        <label className="req-field">
          <span>PWD exemption (KES / month)</span>
          {num('pwd')}
        </label>
        <label className="req-field">
          <span>Secondary employment rate (%)</span>
          {num('secondary')}
        </label>
        <label className="req-field">
          <span>NITA levy (KES / employee)</span>
          {num('nita')}
        </label>
        <label className="req-field">
          <span>KRA prescribed loan rate (%)</span>
          {num('prescribed')}
        </label>
        <label className="req-field">
          <span>NSSF rate (%, each share)</span>
          {num('nssfRate')}
        </label>
        <label className="req-field">
          <span>Housing relief (% of levy, 0 = off)</span>
          {num('housingRate')}
        </label>
        <label className="req-field">
          <span>Insurance relief cap (KES / month)</span>
          {num('insuranceCap')}
        </label>
        <label className="req-field">
          <span>PMF relief cap (KES / month)</span>
          {num('pmfCap')}
        </label>
        <label className="req-field">
          <span>Pension deduction cap (KES / month)</span>
          {num('pensionMax')}
        </label>
        <label className="req-field">
          <span>Mortgage interest cap (KES / month)</span>
          {num('mortgageCap')}
        </label>
        <label className="req-field">
          <span>Voluntary deduction limit (% of net)</span>
          {num('deductionCap')}
        </label>
      </div>
      <div>
        <div className="req-section-title">PAYE bands (monthly)</div>
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Band</th>
              <th>Up to (KES)</th>
              <th>Rate (%)</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input className="form-control" value={b.upTo} placeholder="No limit" onChange={(ev) => setBands((xs) => xs.map((x, k) => (k === i ? { ...x, upTo: ev.target.value } : x)))} />
                </td>
                <td>
                  <input className="form-control" value={b.rate} onChange={(ev) => setBands((xs) => xs.map((x, k) => (k === i ? { ...x, rate: ev.target.value } : x)))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

const Simulator: React.FC = () => {
  const [gross, setGross] = useState(150_000);
  const [pensionable, setPensionable] = useState(145_000);
  const [bik, setBik] = useState(0);
  const [pension, setPension] = useState(0);
  const [pmf, setPmf] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [mortgage, setMortgage] = useState(0);
  const [profile, setProfile] = useState<'PRIMARY' | 'SECONDARY' | 'PWD' | 'EXEMPT'>('PRIMARY');
  const [date, setDate] = useState(today());
  const r = useMemo(
    () =>
      computeStatutory({
        date,
        cashGross: gross,
        nssfBase: pensionable,
        benefitsInKind: bik,
        pension,
        pmf,
        insurancePremium: insurance,
        mortgageInterest: mortgage,
        profile: {
          employment: profile === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
          pwdExempt: profile === 'PWD',
          taxExempt: profile === 'EXEMPT'
        }
      }),
    [gross, pensionable, bik, pension, pmf, insurance, mortgage, profile, date]
  );
  const net = gross - r.nssfEe - r.shif - r.ahlEe - r.paye - pension - pmf;
  const field = (label: string, value: number, set: (n: number) => void) => (
    <label className="req-field">
      <span>{label}</span>
      <input className="form-control" type="number" min={0} value={value} onChange={(ev) => set(Number(ev.target.value))} />
    </label>
  );
  const row = (label: string, v: number, minus = false, strong = false) => (
    <tr className={strong ? 'total' : ''}>
      <td className={strong ? '' : 'indent'}>{label}</td>
      <td className="num">{minus ? `(${kes(v)})` : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
    </tr>
  );
  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Statutory simulator</h3>
          <p>Try any figures. Uses the rate version in force on the chosen date. Spec check: KES 150,000 gross (145,000 pensionable) gives PAYE 33,189 and net 103,956.</p>
        </div>
      </div>
      <div className="pr-builder" style={{ gridTemplateColumns: '320px minmax(0,1fr)' }}>
        <div className="pr-form-grid" style={{ alignContent: 'start' }}>
          {field('Cash gross pay', gross, setGross)}
          {field('NSSF pensionable pay', pensionable, setPensionable)}
          {field('Non-cash benefits', bik, setBik)}
          {field('Pension contribution', pension, setPension)}
          {field('PMF contribution', pmf, setPmf)}
          {field('Insurance premiums', insurance, setInsurance)}
          {field('Mortgage interest', mortgage, setMortgage)}
          <label className="req-field">
            <span>Tax status</span>
            <select className="form-control" value={profile} onChange={(ev) => setProfile(ev.target.value as typeof profile)}>
              <option value="PRIMARY">Primary employment</option>
              <option value="SECONDARY">Secondary employment</option>
              <option value="PWD">PWD certificate</option>
              <option value="EXEMPT">Tax exempt</option>
            </select>
          </label>
          <label className="req-field wide">
            <span>Pay date</span>
            <input className="form-control" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </label>
        </div>
        <table className="pr-doc">
          <tbody>
            {row('Cash gross pay', gross, false, true)}
            {row(`NSSF Tier I (${kes(r.rateTable.nssf.lel)} × 6%)`, r.nssfTierI, true)}
            {row(`NSSF Tier II (to ${kes(r.rateTable.nssf.uel)} × 6%)`, r.nssfTierII, true)}
            {row('SHIF (2.75%, min 300)', r.shif, true)}
            {row('Housing levy (1.5%)', r.ahlEe, true)}
            {r.pensionAllowed > 0 && row('Allowable pension', r.pensionAllowed, true)}
            {r.mortgageAllowed > 0 && row('Mortgage interest', r.mortgageAllowed, true)}
            {bik > 0 && row('Plus non-cash benefits', bik)}
            {row('Taxable pay', Math.round(r.taxablePay), false, true)}
            {r.pwdExempt > 0 && row('PWD exemption', Math.round(r.pwdExempt), true)}
            {r.bandLines.map((b) => row(r.method === 'HIGHEST_RATE' ? `Flat ${pctv(b.rate)} on ${kes(b.amount)}` : `Band ${b.band}: ${kes(b.amount)} × ${pctv(b.rate)}`, Math.round(b.tax * 100) / 100))}
            {row('Gross tax', Math.round(r.grossTax * 100) / 100)}
            {r.method === 'BANDS' && row('Personal relief', r.personalRelief, true)}
            {r.method === 'BANDS' && row('Housing relief (15% of levy)', Math.round(r.housingRelief * 100) / 100, true)}
            {r.pmfRelief > 0 && row('PMF relief', r.pmfRelief, true)}
            {r.insuranceRelief > 0 && row('Insurance relief', r.insuranceRelief, true)}
            {row('PAYE', r.paye, false, true)}
            {(pension > 0 || pmf > 0) && row('Pension and PMF', pension + pmf, true)}
            <tr className="grand">
              <td>Net pay before voluntary deductions</td>
              <td className="num">{kes(net)}</td>
            </tr>
            <tr>
              <td className="indent">Employer cost: NSSF {kes(r.nssfEr)} + levy {kes(r.ahlEr)} + NITA {r.nita}</td>
              <td className="num">{kes(gross + r.nssfEr + r.ahlEr + r.nita)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="pr-muted" style={{ marginTop: 8 }}>
        {r.note} · Rate version {r.rateTable.id}
      </div>
    </div>
  );
};

type ReliefKey = 'housingRelief' | 'insuranceRelief' | 'pmfRelief';

/**
 * The PAYE reliefs and the switch for each. A change applies from the open payroll period through a rate
 * version starting that month, so paid months keep the reliefs they were paid with.
 */
const ReliefSettings: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { payrollOpenPeriod, noteRatesChanged, addToast } = useApp();
  const from = `${payrollOpenPeriod.key}-01`;
  const cur = ratesOn(from);
  const [personal, setPersonal] = useState(String(cur.paye.personalRelief));
  const rows: { key: ReliefKey; name: string; base: string; where: string; previous: number }[] = [
    { key: 'housingRelief', name: 'Affordable housing relief', base: 'of the employee’s housing levy', where: 'Every payslip: “Less housing relief” in the PAYE working', previous: 0.15 },
    { key: 'insuranceRelief', name: 'Insurance relief', base: 'of life / education premiums deducted through payroll', where: 'Payslips with an Insurance premium pay item', previous: 0.15 },
    { key: 'pmfRelief', name: 'Post-retirement medical fund relief', base: 'of PMF contributions', where: 'Payslips with a PMF pay item', previous: 0.15 }
  ];
  const history = (key: ReliefKey) =>
    [...rateTables()]
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
      .map((t) => `${t.effectiveFrom.slice(0, 7)}: ${t.paye[key].rate ? `${pctv(t.paye[key].rate)} ≤ ${kes(t.paye[key].cap)}` : 'off'}`)
      .join(' · ');
  const apply = (label: string, patch: (t: StatutoryRateTable) => StatutoryRateTable) => {
    // A second change in the same period adds to that period's version rather than making another
    const id = setRatesFrom(from, (t) => ({ ...patch(t), label: t.label.startsWith('Payroll settings') ? `${t.label}; ${label.toLowerCase()}` : `Payroll settings — ${label.toLowerCase()}`, source: 'Company payroll settings' }));
    noteRatesChanged();
    onChanged();
    addToast({ type: 'success', title: 'Relief settings saved', message: `${label} from ${payrollOpenPeriod.label} (rate version ${id}). Paid months are unchanged.` });
  };
  const toggle = (key: ReliefKey, name: string, previous: number) => {
    const on = cur.paye[key].rate > 0;
    apply(`${name} ${on ? 'off' : 'on'}`, (t) => ({ ...t, paye: { ...t.paye, [key]: { ...t.paye[key], rate: on ? 0 : previous } } }));
  };
  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>PAYE reliefs</h3>
          <p>
            Reliefs come off the tax worked out from the PAYE bands. Each is held in the dated rate tables (<code>src/data/statutoryRates.ts</code> → <code>paye.housingRelief</code> etc.) and applied in the PAYE step of
            the payroll engine (<code>computeStatutory</code> in <code>src/utils/statutory.ts</code>). Turning one on or off here applies from {payrollOpenPeriod.label}; paid months keep what they were paid with.
          </p>
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Relief</th>
              <th>Rule in force for {payrollOpenPeriod.label}</th>
              <th>Where you see it</th>
              <th>History</th>
              <th>Applied</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Personal relief</strong>
                <div className="muted">Every resident employee, primary employment only</div>
              </td>
              <td>KES {kes(cur.paye.personalRelief)} a month</td>
              <td className="muted">“Less personal relief” in the PAYE working</td>
              <td className="muted" style={{ maxWidth: 220 }}>
                {[...rateTables()]
                  .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
                  .map((t) => `${t.effectiveFrom.slice(0, 7)}: ${kes(t.paye.personalRelief)}`)
                  .join(' · ')}
              </td>
              <td>
                <span className="digicraft-status-pill success">On</span>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <input className="form-control" style={{ width: 90, display: 'inline-block' }} type="number" value={personal} onChange={(ev) => setPersonal(ev.target.value)} aria-label="Personal relief" />{' '}
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 10px', fontSize: 11 }}
                  disabled={Number(personal) === cur.paye.personalRelief || !(Number(personal) >= 0)}
                  onClick={() => apply(`Personal relief KES ${kes(Number(personal))}`, (t) => ({ ...t, paye: { ...t.paye, personalRelief: Number(personal) } }))}
                >
                  Save
                </button>
              </td>
            </tr>
            {rows.map((r) => {
              const v = cur.paye[r.key];
              const on = v.rate > 0;
              return (
                <tr key={r.key}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="muted">Not given on secondary employment or to tax-exempt staff</div>
                  </td>
                  <td>{on ? `${pctv(v.rate)} ${r.base}, up to KES ${kes(v.cap)} a month` : 'Not applied'}</td>
                  <td className="muted">{r.where}</td>
                  <td className="muted" style={{ maxWidth: 220 }}>
                    {history(r.key)}
                  </td>
                  <td>
                    <span className={`digicraft-status-pill ${on ? 'success' : 'info'}`}>{on ? 'On' : 'Off'}</span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => toggle(r.key, r.name, r.previous)}>
                      Turn {on ? 'off' : 'on'} from {payrollOpenPeriod.label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pr-note" style={{ marginTop: 10 }}>
        Housing relief is on because the client payroll specification (§2, §5) asks for it alongside the housing levy being deducted before PAYE. Confirm with your tax adviser whether it still applies under the current Finance Act;
        if not, turn it off here — the October payroll and later recalculate at once.
      </div>
    </div>
  );
};

export const StatutoryRates: React.FC = () => {
  const { noteRatesChanged } = useApp();
  const [adding, setAdding] = useState<false | 'edit' | 'new'>(false);
  const [, setVersion] = useState(0);
  const now = today();
  const current = ratesOn(now);
  const list = [...rateTables()].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const policy = PAYROLL_POLICY;
  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Statutory rate versions</h3>
            <p>Each payslip uses the version in force on its pay date, so reprints of old months use old rates. New rates are added as a new version — existing ones are never edited.</p>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-primary" onClick={() => setAdding('edit')}>
              <Pencil size={15} /> Edit rates
            </button>
            <button className="btn btn-secondary" onClick={() => setAdding('new')}>
              <Plus size={15} /> New version from a later date
            </button>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>In force</th>
                <th className="num">NSSF limits</th>
                <th className="num">SHIF</th>
                <th className="num">Housing levy</th>
                <th className="num">Personal relief</th>
                <th className="num">Top band</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const state = t.id === current.id ? 'Current' : t.effectiveFrom > now ? 'Upcoming' : 'Past';
                return (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <strong>{t.id}</strong>
                      <div className="muted">{t.label}</div>
                    </td>
                    <td>
                      {t.effectiveFrom} → {t.effectiveTo ?? 'open'}{' '}
                      <span className={`digicraft-status-pill ${state === 'Current' ? 'success' : state === 'Upcoming' ? 'warning' : 'info'}`}>{state}</span>
                    </td>
                    <td className="num">
                      {kes(t.nssf.lel)} / {kes(t.nssf.uel)}
                    </td>
                    <td className="num">
                      {pctv(t.shif.rate)} (min {t.shif.floor})
                    </td>
                    <td className="num">{pctv(t.ahl.rate)} + {pctv(t.ahl.rate)}</td>
                    <td className="num">{kes(t.paye.personalRelief)}</td>
                    <td className="num">{pctv(t.paye.bands[t.paye.bands.length - 1].rate)}</td>
                    <td className="muted" style={{ maxWidth: 260 }}>
                      {t.source}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pr-kv" style={{ marginTop: 14 }}>
          <div>
            <span>PAYE bands ({current.id})</span>
            <strong style={{ fontSize: 12 }}>{current.paye.bands.map((b) => `${pctv(b.rate)}${b.upTo === Infinity ? '+' : ' ≤' + kes(b.upTo)}`).join(' · ')}</strong>
          </div>
          <div>
            <span>Reliefs</span>
            <strong style={{ fontSize: 12 }}>
              Personal {kes(current.paye.personalRelief)} · housing 15% (≤{kes(current.paye.housingRelief.cap)}) · insurance 15% (≤{kes(current.paye.insuranceRelief.cap)}) · PMF 15% (≤{kes(current.paye.pmfRelief.cap)})
            </strong>
          </div>
          <div>
            <span>Exemptions</span>
            <strong style={{ fontSize: 12 }}>
              PWD first {kes(current.paye.pwdExemptMonthly)} · secondary flat {pctv(current.paye.secondaryRate)}
            </strong>
          </div>
          <div>
            <span>Caps &amp; levies</span>
            <strong style={{ fontSize: 12 }}>
              Pension ≤{kes(current.pensionCap.max)} or 30% · mortgage ≤{kes(current.mortgageInterestCap)} · NITA {current.nita} · ⅔ deduction limit · loan rate {pctv(current.prescribedLoanRate)}
            </strong>
          </div>
        </div>
      </div>

      <ReliefSettings onChanged={() => setVersion((n) => n + 1)} />

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Company payroll policy</h3>
            <p>
              Choices the regulations leave to the employer. Adopted {policy.adoptedOn} · approved by {policy.approvedBy}.
            </p>
          </div>
        </div>
        <div className="pr-kv">
          <div>
            <span>Overtime and NSSF</span>
            <strong style={{ fontSize: 13 }}>{policy.overtimePensionable ? 'Pensionable' : 'Not pensionable'}</strong>
            <small>Irregular pay kept out of NSSF</small>
          </div>
          <div>
            <span>Benefits and housing levy</span>
            <strong style={{ fontSize: 13 }}>{policy.benefitsInKindAttractAhl ? 'Levy applies' : 'Cash pay only'}</strong>
            <small>Pending clearer KRA guidance</small>
          </div>
          <div>
            <span>Day rate</span>
            <strong style={{ fontSize: 13 }}>Monthly pay ÷ {policy.dayDivisor}</strong>
            <small>Joiners, leavers, leave pay, notice and severance</small>
          </div>
          <div>
            <span>Arrears</span>
            <strong style={{ fontSize: 13 }}>{policy.arrearsTaxation === 'current_period_bands' ? 'Taxed this month' : 'Recomputed per month'}</strong>
            <small>At the bands in force when paid</small>
          </div>
          <div>
            <span>Loans on exit</span>
            <strong style={{ fontSize: 13 }}>{policy.recoverLoansOnExit ? 'Recovered in full' : 'Two-thirds limit applies'}</strong>
            <small>From final dues</small>
          </div>
        </div>
      </div>

      <Simulator />
      {adding && (
        <NewVersionModal
          mode={adding}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setVersion((n) => n + 1);
            noteRatesChanged();
          }}
        />
      )}
    </>
  );
};
