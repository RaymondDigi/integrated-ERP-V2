import React from 'react';
import { useApp } from '../../../context/AppContext';
import { destLabel, FINANCE_APPROVER, TRANSPORT, TRAVEL_STATUS, type TravelRequest } from '../../../data/travelEngine';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { fmt, kes, Modal, useTravelOrg } from './shared';

/** Printable travel authority with the cost estimate and signature lines. */
export const TravelAuthority: React.FC<{ r: TravelRequest; onClose: () => void }> = ({ r, onClose }) => {
  const { activeTenant } = useApp();
  const { byId, name } = useTravelOrg();
  const e = byId.get(r.staffId);
  const est = r.estimate;
  const fx = r.destClass === 'INTL' ? ` (USD at ${est.fxUsdKes})` : '';
  const approvals = r.events.filter((x) => /approved|declined/i.test(x.action));
  const report: Report = {
    title: 'Travel Authority',
    subtitle: `${r.id} · ${TRAVEL_STATUS[r.status].label}`,
    kpis: [
      { label: 'Traveller', value: name(r.staffId), sub: `${r.staffId} · ${e?.jobTitle ?? ''}` },
      { label: 'Department', value: e?.department ?? '—', sub: `Grade band ${est.band}` },
      { label: 'Dates', value: `${fmt(r.departDate)} – ${fmt(r.returnDate)}`, sub: `${est.nights} night(s), ${est.days} day(s)` },
      { label: 'Destination', value: r.destinations, sub: destLabel(r.destClass) }
    ],
    sections: [
      {
        heading: 'Trip',
        columns: [{ label: 'Item' }, { label: 'Detail' }],
        rows: [
          ['Purpose', r.purpose],
          ['Transport', `${TRANSPORT[r.transport]}${r.transport === 'OWN_CAR' ? ` — ${r.km ?? 0} km` : ''}`],
          ['Per diem paid', r.perDiemVia === 'PAYROLL' ? 'Through payroll (exempt per diem)' : r.perDiemVia === 'CASH' ? 'In cash with the advance' : 'To be decided by Finance'],
          ['Rates used', `${est.scheduleId}${fx}`]
        ]
      },
      {
        heading: 'Estimated cost',
        columns: [{ label: 'Item' }, { label: 'Basis' }, { label: 'Amount', num: true }],
        rows: [
          ['Accommodation', `${est.nights} night(s)`, est.accommodation],
          ['Meals', `${est.days} day(s)`, est.meals],
          ['Incidentals', `${est.days} day(s)`, est.incidentals],
          ['Mileage (own car)', r.transport === 'OWN_CAR' ? `${r.km ?? 0} km` : '—', est.mileage],
          ['Fares', r.transport === 'BUS' || r.transport === 'AIR' ? TRANSPORT[r.transport] : '—', est.fares]
        ],
        foot: ['Total estimate', '', est.total]
      },
      {
        heading: 'Advance and approvals',
        columns: [{ label: 'Step' }, { label: 'By' }, { label: 'Date' }],
        rows: [
          ['Advance requested', kes(r.advanceRequested), fmt(r.createdOn)],
          ['Advance approved', r.advanceApproved !== undefined ? kes(r.advanceApproved) : 'Pending', r.imprestId ?? ''],
          ...approvals.map((a) => [a.action, a.by, fmt(a.at)])
        ]
      }
    ],
    footnote: 'The advance must be surrendered with receipts within 7 days of return. Unsurrendered balances are recovered through payroll.',
    signatures: [`Traveller: ${name(r.staffId)}`, `Line manager: ${name(r.managerId)}`, `Finance: ${name(FINANCE_APPROVER)}`]
  };
  return (
    <Modal title={`Travel authority ${r.id}`} subtitle="Print and sign before travel" onClose={onClose} width={900}>
      <ReportPaper report={report} company={activeTenant.name} />
    </Modal>
  );
};
