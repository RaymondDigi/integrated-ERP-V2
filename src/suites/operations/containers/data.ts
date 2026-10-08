import { addDays, TODAY } from '../../finance/engine';
import { OPS_ACTORS } from '../data';
import type { HistoryEntry } from '../../finance/types';
import type { Container, ContainerEvent, ContainersState } from './types';

const d = (o: number) => addDays(TODAY, o);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:30:00`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const { OFFICER: mary, STOREKEEPER: john, MANAGER: esther } = OPS_ACTORS;
const ev = (date: string, hour: number, status: ContainerEvent['status'], location: string, by: string, note?: string): ContainerEvent => ({ at: `${date} ${String(hour).padStart(2, '0')}:00`, status, location, by, note });

export const buildContainersSeed = (): ContainersState => {
  const containers: Container[] = [
    {
      id: 'ct1',
      number: 'MSCU 7712093',
      type: '20GP',
      line: 'MSC',
      bookingId: 'cb0',
      status: 'LOADED',
      location: 'MSC Aurora',
      releasedOn: d(-12),
      stuffedOn: d(-9),
      sealNo: 'MS-118204',
      shipmentId: 'sh2',
      vessel: 'MSC Aurora',
      cutOff: `${d(-7)}T12:00`,
      lots: [{ lotNo: 'KP-7702', garden: 'Kapkoros', grade: 'BP1', packages: 50, kg: 3_250 }, { lotNo: 'MO-1188', garden: 'Momul', grade: 'PF1', packages: 44, kg: 2_816 }],
      events: [
        ev(d(-12), 9, 'EMPTY_RELEASED', 'MSC empty depot, Changamwe', john.name),
        ev(d(-11), 14, 'AT_WAREHOUSE', 'Changamwe tea warehouse, Mombasa', john.name),
        ev(d(-9), 16, 'STUFFED', 'Changamwe tea warehouse, Mombasa', john.name, 'Seal MS-118204'),
        ev(d(-8), 10, 'GATED_IN', 'Kilindini port — container yard', john.name),
        ev(d(-6), 19, 'LOADED', 'MSC Aurora', mary.name)
      ]
    },
    {
      id: 'ct2',
      number: 'MSCU 4471203',
      type: '20GP',
      line: 'MSC',
      bookingId: 'cb2',
      status: 'STUFFED',
      location: 'Siginon tea warehouse, Changamwe',
      releasedOn: d(-3),
      stuffedOn: d(-1),
      sealNo: 'MS-220931',
      vessel: 'MSC Rania',
      cutOff: `${d(2)}T12:00`,
      lots: [{ lotNo: 'SG-5410', garden: 'Gitugi', grade: 'BP1', packages: 64, kg: 4_160 }],
      events: [ev(d(-3), 9, 'EMPTY_RELEASED', 'MSC empty depot, Changamwe', john.name), ev(d(-2), 11, 'AT_WAREHOUSE', 'Siginon tea warehouse, Changamwe', john.name), ev(d(-1), 15, 'STUFFED', 'Siginon tea warehouse, Changamwe', john.name, 'Seal MS-220931')]
    },
    {
      id: 'ct3',
      number: 'MSCU 4471219',
      type: '20GP',
      line: 'MSC',
      bookingId: 'cb2',
      status: 'AT_WAREHOUSE',
      location: 'Siginon tea warehouse, Changamwe',
      releasedOn: d(-3),
      vessel: 'MSC Rania',
      cutOff: `${d(2)}T12:00`,
      lots: [],
      events: [ev(d(-3), 9, 'EMPTY_RELEASED', 'MSC empty depot, Changamwe', john.name), ev(d(-2), 11, 'AT_WAREHOUSE', 'Siginon tea warehouse, Changamwe', john.name)]
    },
    {
      id: 'ct4',
      number: 'MSKU 9920114',
      type: '40HC',
      line: 'Maersk',
      bookingId: 'cb1',
      status: 'EMPTY_RELEASED',
      location: 'Maersk empty depot, Changamwe',
      releasedOn: d(-1),
      vessel: 'Maersk Kalmar',
      cutOff: `${d(16)}T12:00`,
      lots: [],
      events: [ev(d(-1), 10, 'EMPTY_RELEASED', 'Maersk empty depot, Changamwe', john.name)]
    },
    {
      id: 'ct5',
      number: 'CMAU 3381920',
      type: '20GP',
      line: 'CMA CGM',
      bookingId: 'cb5',
      status: 'ROLLED_OVER',
      location: 'Kilindini port — container yard',
      releasedOn: d(-16),
      stuffedOn: d(-13),
      sealNo: 'CC-771032',
      vessel: 'CMA CGM Tanzania',
      cutOff: `${d(3)}T12:00`,
      lots: [{ lotNo: 'CH-1301', garden: 'Chinga', grade: 'PF1', packages: 60, kg: 3_840 }],
      events: [
        ev(d(-16), 9, 'EMPTY_RELEASED', 'CMA CGM depot, Kipevu', john.name),
        ev(d(-15), 12, 'AT_WAREHOUSE', 'Changamwe tea warehouse, Mombasa', john.name),
        ev(d(-13), 15, 'STUFFED', 'Changamwe tea warehouse, Mombasa', john.name, 'Seal CC-771032'),
        ev(d(-11), 9, 'GATED_IN', 'Kilindini port — container yard', john.name),
        ev(d(-9), 18, 'ROLLED_OVER', 'Kilindini port — container yard', mary.name, 'Vessel CMA CGM Tage over-booked — rolled to CMA CGM Tanzania')
      ]
    },
    {
      id: 'ct6',
      number: 'PCIU 2208177',
      type: '20GP',
      line: 'PIL',
      bookingId: 'cb6',
      status: 'RETURNED',
      location: 'PIL empty depot, Mombasa',
      releasedOn: d(-30),
      stuffedOn: d(-27),
      sealNo: 'PL-009812',
      lots: [],
      events: [
        ev(d(-30), 9, 'EMPTY_RELEASED', 'PIL empty depot, Mombasa', john.name),
        ev(d(-29), 11, 'AT_WAREHOUSE', 'Changamwe tea warehouse, Mombasa', john.name),
        ev(d(-27), 16, 'STUFFED', 'Changamwe tea warehouse, Mombasa', john.name),
        ev(d(-26), 10, 'GATED_IN', 'Kilindini port — container yard', john.name),
        ev(d(-24), 9, 'WITHDRAWN', 'Changamwe tea warehouse, Mombasa', esther.name, 'Buyer cancelled — teas re-warehoused'),
        ev(d(-22), 12, 'RETURNED', 'PIL empty depot, Mombasa', john.name)
      ]
    }
  ];
  return {
    bookings: [
      { id: 'cb0', number: num('CB', 1), shipmentId: 'sh2', line: 'MSC', containerType: '20GP', qty: 1, cargo: 'Black tea BP1/PF1 — 94 packages', destination: 'Jebel Ali, Dubai', requestedEtd: d(-6), status: 'CONFIRMED', confirmation: { bookingRef: 'MSC 77120593', vessel: 'MSC Aurora', voyage: 'FA614R', etd: d(-6), cutOff: `${d(-7)}T12:00`, releaseOrder: 'RO-MSC-55120' }, requestedBy: mary.name, history: [h(d(-15), 9, mary.name, 'Requested'), h(d(-15), 10, mary.name, 'Sent to MSC Kenya Ltd'), h(d(-13), 15, mary.name, 'Confirmed by the line', 'MSC 77120593')] },
      { id: 'cb1', number: num('CB', 2), shipmentId: 'sh4', line: 'Maersk', containerType: '40HC', qty: 2, cargo: 'Bulk tea in 25 kg sacks', destination: 'Jebel Ali, Dubai', requestedEtd: d(18), status: 'CONFIRMED', confirmation: { bookingRef: 'MAEU 230044718', vessel: 'Maersk Kalmar', voyage: '442W', etd: d(18), cutOff: `${d(16)}T12:00`, releaseOrder: 'RO-MSK-90311' }, requestedBy: mary.name, history: [h(d(-4), 9, mary.name, 'Requested'), h(d(-4), 9, mary.name, 'Sent to Maersk Kenya Ltd'), h(d(-3), 14, mary.name, 'Confirmed by the line', 'MAEU 230044718')] },
      { id: 'cb2', number: num('CB', 3), line: 'MSC', containerType: '20GP', qty: 2, cargo: 'Auction teas Sale 40 (Gitugi, Michimikuru, Iriaini)', destination: 'Karachi, Pakistan', requestedEtd: d(4), status: 'CONFIRMED', confirmation: { bookingRef: 'MSC 77219904', vessel: 'MSC Rania', voyage: 'FR602A', etd: d(4), cutOff: `${d(2)}T12:00`, releaseOrder: 'RO-MSC-55187' }, requestedBy: mary.name, history: [h(d(-7), 9, mary.name, 'Requested'), h(d(-7), 11, mary.name, 'Sent to MSC Kenya Ltd'), h(d(-4), 10, mary.name, 'Confirmed by the line', 'MSC 77219904')] },
      { id: 'cb3', number: num('CB', 4), shipmentId: 'sh3', line: 'CMA CGM', containerType: '20GP', qty: 1, cargo: 'Bulk tea sacks — 120 × 25 kg', destination: 'Port Sultan Qaboos, Muscat', requestedEtd: d(5), status: 'SENT', requestedBy: mary.name, history: [h(d(-2), 9, mary.name, 'Requested'), h(d(-2), 9, mary.name, 'Sent to CMA CGM Kenya, Mombasa')] },
      { id: 'cb4', number: num('CB', 5), line: 'PIL', containerType: '40GP', qty: 1, cargo: 'Packaged tea cartons', destination: 'Durban, South Africa', requestedEtd: d(20), status: 'REQUESTED', requestedBy: mary.name, history: [h(d(0), 8, mary.name, 'Requested')] },
      { id: 'cb5', number: num('CB', 6), line: 'CMA CGM', containerType: '20GP', qty: 1, cargo: 'Chinga PF1 — 60 packages', destination: 'Port Said, Egypt', requestedEtd: d(-8), status: 'CONFIRMED', confirmation: { bookingRef: 'CMA 55098811', vessel: 'CMA CGM Tanzania', voyage: '0MA4QN', etd: d(5), cutOff: `${d(3)}T12:00`, releaseOrder: 'RO-CMA-22041' }, requestedBy: mary.name, history: [h(d(-20), 9, mary.name, 'Requested'), h(d(-20), 10, mary.name, 'Sent to CMA CGM Kenya, Mombasa'), h(d(-18), 11, mary.name, 'Confirmed by the line', 'CMA 55098811')] },
      { id: 'cb6', number: num('CB', 7), line: 'PIL', containerType: '20GP', qty: 1, cargo: 'Blended tea — cancelled order', destination: 'Jeddah, Saudi Arabia', requestedEtd: d(-22), status: 'CONFIRMED', confirmation: { bookingRef: 'PIL 88302215', vessel: 'Kota Lumayan', voyage: 'KLY 091', etd: d(-22), cutOff: `${d(-24)}T12:00`, releaseOrder: 'RO-PIL-1031' }, requestedBy: mary.name, history: [h(d(-33), 9, mary.name, 'Requested'), h(d(-33), 9, mary.name, 'Sent to Pacific International Lines (Kenya)'), h(d(-31), 15, mary.name, 'Confirmed by the line', 'PIL 88302215')] }
    ],
    containers,
    discrepancies: [
      { id: 'pd1', number: num('PD', 1), containerNo: 'MSCU 4471203', source: 'KRA email', receivedOn: d(0), type: 'WEIGHT', declared: '4,160 kg', found: '4,410 kg', status: 'OPEN', raw: 'KRA ICMS notice: container MSCU 4471203 — declared 4,160 kg, verified gross mass found 4,410 kg. Amend the export entry before gate-in.', loggedBy: mary.name },
      { id: 'pd2', number: num('PD', 2), containerNo: 'MSCU 7712093', source: 'Manual', receivedOn: d(-8), type: 'SEAL', declared: 'MS-118204', found: 'MS-118204 (tamper tape torn)', status: 'RESOLVED', resolution: 'KRA officer re-inspected; seal intact, tape replaced. Released for loading.', resolvedBy: esther.name, loggedBy: john.name }
    ],
    sequence: { CB: 7, PD: 2 }
  };
};
