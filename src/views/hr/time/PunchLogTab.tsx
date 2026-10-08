import React, { useMemo, useState } from 'react';
import { Fingerprint, MapPin, PenLine, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { TIME_RULES } from '../../../data/timeConfig';
import { addDays, fmtDate, fmtMin } from '../../../data/timeEngine';
import { Chips, EmpCell, Empty, NotTracked, Pill, useTimeOrg } from './shared';
import { ImportCsvButton } from '../../../platform/Widgets';
import { SimulatedBadge } from '../hcm/ui';

type Src = 'ALL' | 'BIOMETRIC' | 'MOBILE' | 'MANUAL';

export const PunchLogTab: React.FC = () => {
  const { timePunches, selectedOrgId, importDevicePunches } = useApp();
  const { byId, tracked, today } = useTimeOrg();
  const [date, setDate] = useState(today);
  const [src, setSrc] = useState<Src>('ALL');
  const [q, setQ] = useState('');
  const dayPunches = useMemo(() => timePunches.filter((p) => p.orgId === selectedOrgId && p.date === date), [timePunches, selectedOrgId, date]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dayPunches
      .filter((p) => src === 'ALL' || p.source === src)
      .filter((p) => !s || `${p.staffId} ${byId.get(p.staffId)?.fullName} ${p.device}`.toLowerCase().includes(s))
      .sort((a, b) => b.min - a.min);
  }, [dayPunches, src, q, byId]);
  const pg = usePaged(rows, 25, `${date}|${src}|${q}`);
  if (!tracked) return <NotTracked />;
  const n = (s: Src) => dayPunches.filter((p) => s === 'ALL' || p.source === s).length;
  const icon = { BIOMETRIC: <Fingerprint size={13} />, MOBILE: <MapPin size={13} />, MANUAL: <PenLine size={13} /> };

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Punch log</h3>
          <p>Raw punches from the biometric terminals, the mobile app (GPS geofence) and supervisor corrections for {fmtDate(date, true)}.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <SimulatedBadge what="ZKTeco / ADMS terminal sync" />
            <ImportCsvButton label="Import terminal export" template={['staffId', 'date', 'time', 'direction', 'device']} onImport={importDevicePunches} />
          </div>
        </div>
        <input className="form-control" style={{ width: 'auto' }} type="date" aria-label="Punch date" value={date} min={addDays(today, -TIME_RULES.historyDays)} max={today} onChange={(ev) => ev.target.value && setDate(ev.target.value)} />
      </div>
      <Chips
        label="Punch source"
        value={src}
        onChange={setSrc}
        options={[
          { id: 'ALL', label: 'All', n: n('ALL') },
          { id: 'BIOMETRIC', label: 'Biometric', n: n('BIOMETRIC') },
          { id: 'MOBILE', label: 'Mobile GPS', n: n('MOBILE') },
          { id: 'MANUAL', label: 'Corrections', n: n('MANUAL') }
        ]}
      />
      <div className="pr-toolbar" style={{ margin: '12px 0' }}>
        <div className="form-input-wrapper grow">
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
          <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name, staff ID or device" value={q} onChange={(ev) => setQ(ev.target.value)} />
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Employee</th>
              <th>Direction</th>
              <th>Source</th>
              <th>Location check</th>
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={5}>No punches.</Empty>}
            {pg.rows.map((p) => (
              <tr key={p.id}>
                <td className="tm-mono">{fmtMin(p.min)}</td>
                <td>
                  <EmpCell e={byId.get(p.staffId)} id={p.staffId} />
                </td>
                <td>
                  <Pill cls={p.dir === 'IN' ? 'success' : 'info'}>{p.dir === 'IN' ? 'In' : 'Out'}</Pill>
                </td>
                <td>
                  <span className="tm-src">
                    {icon[p.source]} {p.device}
                  </span>
                  {p.source === 'MANUAL' && (
                    <div className="muted">
                      {p.by} · {p.note}
                    </div>
                  )}
                </td>
                <td>{p.geo ? <Pill cls={p.geo === 'INSIDE' ? 'success' : 'critical'}>{p.geo === 'INSIDE' ? 'Inside geofence' : 'Outside geofence'}</Pill> : <span className="muted">{p.source === 'MANUAL' ? 'Not applicable' : 'Fixed terminal'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="punches" />
    </div>
  );
};
