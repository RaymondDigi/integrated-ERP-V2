import React from 'react';
import { Camera, KeyRound, Radar } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { minsAgo, recoveredValue, type SecuritySystem } from '../../../data/securitySeed';
import { CargoCard } from './CargoCard';
import { OpsLogCard, missedPoints } from './OpsLogCard';
import { SecIncidentsCard } from './SecIncidentsCard';
import { Card, Empty, Pill, Stat, fmtStamp, kes, useNow, useSecOrg } from './shared';

/** OSH › Security & Investigations: cargo escorts, guard operations, incidents and connected security systems. */
export const SecurityTab: React.FC = () => {
  const { consignments, secIncidents, patrolRounds } = useApp();
  const { orgId, today } = useSecOrg();
  const now = useNow();
  const cons = consignments.filter((c) => c.orgId === orgId);
  const inTransit = cons.filter((c) => c.status === 'In transit');
  const requests = cons.filter((c) => c.status === 'Escort requested').length;
  const incs = secIncidents.filter((i) => i.orgId === orgId);
  const open = incs.filter((i) => i.status !== 'Closed');
  const year = incs.filter((i) => i.occurredAt.slice(0, 4) === today.slice(0, 4));
  const loss = year.reduce((n, i) => n + i.lossValue, 0);
  const back = year.reduce((n, i) => n + recoveredValue(i) + (i.claim?.paid ?? 0), 0);
  const missed = patrolRounds.filter((r) => r.orgId === orgId).reduce((n, r) => n + missedPoints(r, now).length, 0);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Consignments in transit" value={inTransit.length} sub={requests ? `${requests} escort requests to approve` : 'No escort requests waiting'} tone={requests ? 'var(--status-warning)' : undefined} />
        <Stat label="Open investigations" value={open.length} sub={`${incs.filter((i) => i.type === 'Breach of seal' && i.status !== 'Closed').length} seal breaches`} tone={open.length ? 'var(--status-warning)' : undefined} />
        <Stat label="Missed patrol points" value={missed} sub="Last night's rounds" tone={missed ? 'var(--status-critical)' : undefined} />
        <Stat label="Losses this year" value={kes(loss)} sub={`${kes(back)} recovered or paid by insurers`} />
      </div>

      <CargoCard />
      <OpsLogCard />
      <SecIncidentsCard />
      <SystemsCard />
    </>
  );
};

const ICON: Record<string, React.ElementType> = { 'CCTV recorder (NVR)': Camera, 'Access control': KeyRound, 'NFC guard patrol app': Radar };

/** Read-only status of the security systems that feed this module. Values are simulated for the demo. */
const SystemsCard: React.FC = () => {
  const { securitySystems } = useApp();
  const { orgId } = useSecOrg();
  const list: SecuritySystem[] = securitySystems.filter((s) => s.orgId === orgId);
  return (
    <Card title="Connected systems" sub="Simulated data: in production these come from the CCTV recorder, access control and patrol app integrations. Read-only.">
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>System</th>
              <th>Devices</th>
              <th>Last sync</th>
              <th>Events (24 h)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <Empty cols={5}>No systems connected for this company.</Empty>}
            {list.map((s) => {
              const Icon = ICON[s.name] ?? Radar;
              return (
                <tr key={s.name}>
                  <td>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon size={14} /> {s.name}
                    </strong>
                    <div className="hi-sub">{s.detail}</div>
                  </td>
                  <td className="hi-wrap">{s.devices}</td>
                  <td>
                    {fmtStamp(minsAgo(s.syncedMinsAgo))}
                    <div className="hi-sub">{s.syncedMinsAgo < 60 ? `${s.syncedMinsAgo} min ago` : `${Math.round(s.syncedMinsAgo / 60)} h ago`}</div>
                  </td>
                  <td>{s.events24h.toLocaleString()}</td>
                  <td>
                    <Pill tone={s.status === 'Online' ? 'success' : s.status === 'Degraded' ? 'warning' : 'danger'}>{s.status}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="hi-sub" style={{ marginTop: 8 }}>
        Simulated feed — no live connection in this demo.
      </div>
    </Card>
  );
};
