import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { CATEGORY_LABEL, SANCTION_LABEL, WARNING_MONTHS, nextStep, suggestSanction, type DisciplinaryCase } from '../../../data/discipline';
import { addDays, daysBetween, fmtDate, fmtShort } from '../../../data/timeEngine';
import { Chips, EmpCell, Empty, Pill } from './shared';
import { SANCTION_CLS, STAGE_CLS } from './CasesTab';
import { STAGE_LABEL } from '../../../data/discipline';

export const WarningsTab: React.FC = () => {
  const { disciplinaryCases, selectedOrgId, hrEmployees, timeToday } = useApp();
  const [show, setShow] = useState<'LIVE' | 'EXPIRED' | 'ALL'>('LIVE');
  const byId = useMemo(() => new Map(hrEmployees.map((e) => [e.staffId, e])), [hrEmployees]);
  const warnings = useMemo(
    () =>
      disciplinaryCases
        .filter((c) => c.orgId === selectedOrgId && c.outcome && WARNING_MONTHS[c.outcome.sanction] && c.appeal?.status !== 'UPHELD')
        .map((c) => ({ c, live: (c.outcome!.expiresOn ?? '') >= timeToday }))
        .sort((a, b) => (a.c.outcome!.expiresOn ?? '').localeCompare(b.c.outcome!.expiresOn ?? '')),
    [disciplinaryCases, selectedOrgId, timeToday]
  );
  const rows = warnings.filter((w) => (show === 'ALL' ? true : show === 'LIVE' ? w.live : !w.live));
  const pg = usePaged(rows, 25, show);

  // People with more than one case in the last 12 months
  const repeat = useMemo(() => {
    const m = new Map<string, DisciplinaryCase[]>();
    for (const c of disciplinaryCases.filter((x) => x.orgId === selectedOrgId && x.raisedOn >= addDays(timeToday, -365))) m.set(c.staffId, [...(m.get(c.staffId) ?? []), c]);
    return [...m.entries()].filter(([, cs]) => cs.length > 1);
  }, [disciplinaryCases, selectedOrgId, timeToday]);

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Warnings register</h3>
            <p>Verbal warnings stay on file for {WARNING_MONTHS.VERBAL} months, written for {WARNING_MONTHS.WRITTEN}, final written for {WARNING_MONTHS.FINAL_WRITTEN}. A live warning raises the suggested sanction for the next offence.</p>
          </div>
          <Chips
            label="Warning state"
            value={show}
            onChange={setShow}
            options={[
              { id: 'LIVE', label: 'Live', n: warnings.filter((w) => w.live).length },
              { id: 'EXPIRED', label: 'Expired', n: warnings.filter((w) => !w.live).length },
              { id: 'ALL', label: 'All' }
            ]}
          />
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Warning</th>
                <th>Case</th>
                <th>Issued</th>
                <th>On file until</th>
                <th>Next offence</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={6}>No warnings.</Empty>}
              {pg.rows.map(({ c, live }) => {
                const left = daysBetween(timeToday, c.outcome!.expiresOn!);
                const next = suggestSanction(disciplinaryCases, c.staffId, c.category, timeToday);
                return (
                  <tr key={c.id}>
                    <td>
                      <EmpCell e={byId.get(c.staffId)} id={c.staffId} sub={byId.get(c.staffId)?.department} />
                    </td>
                    <td>
                      <Pill cls={live ? SANCTION_CLS(c.outcome!.sanction) : 'primary'}>{SANCTION_LABEL[c.outcome!.sanction]}</Pill>
                      <div className="muted">{CATEGORY_LABEL[c.category]}</div>
                    </td>
                    <td>
                      <strong>{c.id}</strong>
                      <div>
                        <Pill cls={STAGE_CLS[c.stage]}>{STAGE_LABEL[c.stage]}</Pill>
                      </div>
                    </td>
                    <td>{fmtDate(c.outcome!.decidedOn)}</td>
                    <td>
                      {fmtDate(c.outcome!.expiresOn!)}
                      <div className={live && left < 30 ? 'tm-late' : 'muted'}>{live ? `${left} days left` : 'Expired'}</div>
                    </td>
                    <td>{live ? SANCTION_LABEL[next.sanction] : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="warnings" />
      </div>

      <div className="pr-card">
        <h3 className="tm-h3">Repeat offenders (last 12 months)</h3>
        {repeat.length === 0 ? (
          <p className="pr-muted">Nobody has more than one case in the last 12 months.</p>
        ) : (
          <ul className="tm-rules">
            {repeat.map(([id, cs]) => (
              <li key={id}>
                <strong>{byId.get(id)?.fullName ?? id}</strong> · {cs.length} cases: {cs.map((c) => `${c.id} (${CATEGORY_LABEL[c.category].toLowerCase()}, ${c.outcome ? SANCTION_LABEL[c.outcome.sanction].toLowerCase() : nextStep(c, timeToday).text.toLowerCase()}, ${fmtShort(c.raisedOn)})`).join('; ')}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
