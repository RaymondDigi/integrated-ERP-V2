import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useControl } from '../../../suites/control/store';
import { INSPECTION_AREAS, SITES, STATUTORY_KINDS } from '../../../data/oshConfig';
import {
  actionOverdue,
  daysUntil,
  doshState,
  frequencyRates,
  inspectionDue,
  KIND_LABEL,
  medicalStatus,
  nowLocal,
  permitView,
  ppeStatus,
  responderCoverage,
  SEVERITY_LABEL,
  statutoryDue
} from '../../../data/oshEngine';
import { fmt, Pill, useOshOrg } from './shared';

type Alert = { key: string; tab: string; cls: 'critical' | 'warning'; text: string; focus?: [string, string] };

/** Everything the dashboard and header show, computed from the module's data. */
export const useOshMetrics = () => {
  const { oshIncidents, workPermits, ppeIssues, oshInspections, medicalExams, oshStatutory, committeeMeetings, wibaClaims, selectedOrgId, oshHours } = useApp();
  const org = useOshOrg();
  return useMemo(() => {
    const today = org.today;
    const now = nowLocal();
    const incidents = oshIncidents.filter((i) => i.orgId === selectedOrgId);
    const rates = frequencyRates(incidents, oshHours.hours, today);
    const alerts: Alert[] = [];

    for (const i of incidents) {
      const d = doshState(i, today);
      if (d.overdue) alerts.push({ key: `dosh-${i.id}`, tab: 'incidents', cls: 'critical', text: `${i.id}: DOSH Form 1 overdue since ${fmt(d.due)}`, focus: ['osh-incident', i.id] });
      else if (d.due && !i.dosh && i.status !== 'CLOSED') alerts.push({ key: `dosh-${i.id}`, tab: 'incidents', cls: 'warning', text: `${i.id}: DOSH Form 1 ${d.label.toLowerCase()} (${fmt(d.due)})`, focus: ['osh-incident', i.id] });
      if (i.status === 'REPORTED' && !i.investigation && !(i.kind === 'INJURY' && i.severity === 'FIRST_AID'))
        alerts.push({ key: `inv-${i.id}`, tab: 'incidents', cls: 'warning', text: `${i.id}: investigation not started`, focus: ['osh-incident', i.id] });
    }
    const incidentActions = incidents.flatMap((i) => i.actions.map((a) => ({ a, ref: i.id })));
    const findingActions = oshInspections.filter((x) => x.orgId === selectedOrgId).flatMap((x) => x.findings.map((f) => ({ a: f.action, ref: x.id })));
    const meetingActions = committeeMeetings.filter((m) => m.orgId === selectedOrgId).flatMap((m) => m.actions.map((a) => ({ a, ref: m.id })));
    const allActions = [...incidentActions, ...findingActions, ...meetingActions];
    const overdueActions = allActions.filter((x) => actionOverdue(x.a, today));
    const openActions = allActions.filter((x) => x.a.status === 'OPEN');
    for (const x of overdueActions) alerts.push({ key: `act-${x.ref}-${x.a.id}`, tab: x.ref.startsWith('INC') ? 'incidents' : x.ref.startsWith('INS') ? 'inspections' : 'statutory', cls: 'critical', text: `Overdue action (${x.ref}): ${x.a.text} — ${x.a.owner}`, focus: x.ref.startsWith('INC') ? ['osh-incident', x.ref] : undefined });

    const permits = workPermits.filter((p) => p.orgId === selectedOrgId);
    const active = permits.filter((p) => permitView(p, now) === 'ACTIVE');
    const expired = permits.filter((p) => permitView(p, now) === 'EXPIRED');
    const awaiting = permits.filter((p) => p.status === 'REQUESTED');
    for (const p of expired) alerts.push({ key: `ptw-${p.id}`, tab: 'permits', cls: 'critical', text: `${p.number}: validity passed but not closed out` });

    // Expiring certificates and examinations within 45 days
    const statutory = oshStatutory.filter((s) => s.orgId === selectedOrgId).map((s) => ({ s, due: statutoryDue(s) }));
    const expiring = statutory.filter((x) => daysUntil(today, x.due) <= 45);
    for (const x of expiring) alerts.push({ key: `st-${x.s.id}`, tab: 'statutory', cls: x.due < today ? 'critical' : 'warning', text: `${STATUTORY_KINDS[x.s.kind].label}: ${x.s.name} ${x.due < today ? 'overdue since' : 'due'} ${fmt(x.due)}` });
    const certExpiring = org.responders.filter((r) => daysUntil(today, r.expiresOn) <= 45);
    for (const r of certExpiring) alerts.push({ key: `cert-${r.id}`, tab: 'inspections', cls: r.expiresOn < today ? 'critical' : 'warning', text: `${org.name(r.staffId)}: ${r.role === 'FIRST_AIDER' ? 'first aid' : 'fire marshal'} certificate ${r.expiresOn < today ? 'expired' : 'expires'} ${fmt(r.expiresOn)}` });

    const coverage = responderCoverage(org.staff, org.responders, today).filter((c) => c.workers && !c.ok);
    for (const c of coverage) alerts.push({ key: `cov-${c.site}`, tab: 'inspections', cls: 'warning', text: `${SITES[c.site].label}: short of cover (${c.fa}/${c.needFa} first aiders, ${c.fm}/${c.needFm} marshals)` });

    const insp = INSPECTION_AREAS.map((a) => inspectionDue(a.id, oshInspections.filter((x) => x.orgId === selectedOrgId), today)).filter((s) => s.overdue);
    for (const s of insp) alerts.push({ key: `insp-${s.area.id}`, tab: 'inspections', cls: 'warning', text: `${s.area.name} inspection overdue since ${fmt(s.nextDue)}` });

    const ppeIssuesOrg = ppeIssues.filter((x) => x.orgId === selectedOrgId);
    const ppe = org.staff.flatMap((e) => ppeStatus(e, ppeIssuesOrg, today));
    const ppeDue = ppe.filter((l) => l.state === 'DUE' || l.state === 'MISSING').length;
    const ppeCompliance = ppe.length ? Math.round(((ppe.length - ppeDue) / ppe.length) * 1000) / 10 : 100;

    const meds = org.staff.flatMap((e) => medicalStatus(e, medicalExams.filter((m) => m.orgId === selectedOrgId), today)).filter((m) => m.required);
    const medsOverdue = meds.filter((m) => m.state === 'OVERDUE').length;

    const claimsOpen = wibaClaims.filter((c) => c.orgId === selectedOrgId && c.status !== 'PAID').length;
    const lastIncidents = [...incidents].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 5);

    return {
      rates,
      incidents,
      openIncidents: incidents.filter((i) => i.status !== 'CLOSED').length,
      overdueActions: overdueActions.length,
      openActions: openActions.length,
      active: active.length,
      awaiting: awaiting.length,
      expired: expired.length,
      expiring: expiring.length + certExpiring.length,
      ppeDue,
      ppeCompliance,
      medsOverdue,
      claimsOpen,
      lastIncidents,
      alerts: alerts.sort((a, b) => (a.cls === b.cls ? 0 : a.cls === 'critical' ? -1 : 1))
    };
  }, [oshIncidents, workPermits, ppeIssues, oshInspections, medicalExams, oshStatutory, committeeMeetings, wibaClaims, selectedOrgId, oshHours.hours, org]);
};

export const DashboardTab: React.FC = () => {
  const { oshHours, setModuleTab, setCurrentView } = useApp();
  const ctl = useControl();
  const m = useOshMetrics();
  const go = (tab: string, focus?: [string, string]) => {
    if (focus) setModuleTab(focus[0], focus[1]);
    setModuleTab('osh-security', tab);
  };
  // Company-level QHSE in the Quality & Risk module, read-only
  const safetyRisks = ctl.state.risks.filter((r) => r.category === 'Safety');
  const incidentCapas = ctl.state.capas.filter((c) => c.source === 'INCIDENT' && c.status !== 'CLOSED');

  return (
    <>
      <div className="pr-kv osh-kv-gap">
        <div>
          <span>LTIFR</span>
          <strong>{m.rates.ltifr}</strong>
          <small>
            {m.rates.lti} lost-time injur{m.rates.lti === 1 ? 'y' : 'ies'} per 1,000,000 hours, last 12 months
          </small>
        </div>
        <div>
          <span>TRIFR</span>
          <strong>{m.rates.trifr}</strong>
          <small>{m.rates.trc} recordable (medical treatment or worse)</small>
        </div>
        <div>
          <span>Hours worked (12 months)</span>
          <strong>{oshHours.hours.toLocaleString()}</strong>
          <small>{oshHours.source === 'attendance' ? `From attendance: ${oshHours.weekly.toLocaleString()} h a week` : `Estimate: ${oshHours.headcount} staff × 45 h a week`}</small>
        </div>
        <div>
          <span>Overdue actions</span>
          <strong className={m.overdueActions ? 'osh-bad' : ''}>{m.overdueActions}</strong>
          <small>{m.openActions} open in total</small>
        </div>
        <div>
          <span>Expiring in 45 days</span>
          <strong className={m.expiring ? 'osh-warn' : ''}>{m.expiring}</strong>
          <small>Examinations, audits, first aid and marshal certificates</small>
        </div>
        <div>
          <span>Medicals overdue</span>
          <strong className={m.medsOverdue ? 'osh-warn' : ''}>{m.medsOverdue}</strong>
          <small>Food handler, audiometry, periodic, pre-employment</small>
        </div>
      </div>

      <div className="osh-two">
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Needs attention</h3>
              <p>{m.alerts.length ? `${m.alerts.length} item${m.alerts.length > 1 ? 's' : ''}, most urgent first.` : 'Nothing outstanding.'}</p>
            </div>
          </div>
          <ul className="osh-alerts">
            {m.alerts.slice(0, 12).map((a) => (
              <li key={a.key} className={a.cls}>
                <AlertTriangle size={14} />
                <span>{a.text}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => go(a.tab, a.focus)} aria-label="Open">
                  <ArrowRight size={13} />
                </button>
              </li>
            ))}
          </ul>
          {m.alerts.length > 12 && <p className="pr-muted">And {m.alerts.length - 12} more in the tabs.</p>}
        </div>

        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Latest incidents</h3>
              <p>{m.openIncidents} open</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => go('incidents')}>
              All incidents
            </button>
          </div>
          <ul className="osh-list">
            {m.lastIncidents.map((i) => (
              <li key={i.id} className="tm-click" onClick={() => go('incidents', ['osh-incident', i.id])}>
                <div>
                  <strong>
                    {i.id} · {KIND_LABEL[i.kind]}
                  </strong>
                  <span className="pr-muted">
                    {fmt(i.occurredOn)} · {i.location}
                  </span>
                </div>
                <Pill cls={i.severity === 'LOST_TIME' || i.severity === 'FATAL' || i.severity === 'PERMANENT' ? 'critical' : i.severity === 'MEDICAL' ? 'warning' : 'info'}>{SEVERITY_LABEL[i.severity]}</Pill>
              </li>
            ))}
          </ul>
          <div className="osh-mini-stats">
            <div>
              <strong>{m.active}</strong>
              <span>active permits</span>
            </div>
            <div>
              <strong>{m.awaiting}</strong>
              <span>awaiting approval</span>
            </div>
            <div>
              <strong>{m.ppeCompliance}%</strong>
              <span>PPE in date</span>
            </div>
            <div>
              <strong>{m.claimsOpen}</strong>
              <span>open WIBA claims</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Company risk register and CAPA</h3>
            <p>Safety risks and incident CAPAs managed company-wide in Quality & Risk. Read-only here.</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              ctl.setQuality('risks');
              setCurrentView('quality');
            }}
          >
            <ExternalLink size={14} /> Open Quality & Risk
          </button>
        </div>
        <ul className="osh-list">
          {safetyRisks.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <span className="pr-muted">
                  Owner {r.owner} · residual {r.residualLikelihood * r.residualImpact} (was {r.likelihood * r.impact}) · {r.treatment}
                </span>
              </div>
              <Pill cls={r.residualLikelihood * r.residualImpact >= 12 ? 'critical' : 'warning'}>Risk</Pill>
            </li>
          ))}
          {incidentCapas.map((c) => (
            <li key={c.id}>
              <div>
                <strong>
                  {c.number}: {c.problem}
                </strong>
                <span className="pr-muted">
                  {c.owner} · due {fmt(c.due)}
                </span>
              </div>
              <Pill cls="info">CAPA {c.status.toLowerCase().replace('_', ' ')}</Pill>
            </li>
          ))}
          {!safetyRisks.length && !incidentCapas.length && <li className="pr-muted">No safety risks or incident CAPAs in the register.</li>}
        </ul>
      </div>
    </>
  );
};
