import { addDays, TODAY } from '../../finance/engine';
import { OPS_ACTORS } from '../data';
import type { HistoryEntry } from '../../finance/types';
import type { DailyLog, FleetExtState, TeaLot } from './types';

const d = (o: number) => addDays(TODAY, o);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:15:00`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const { OFFICER: mary, DRIVER: samuel, TRANSPORT_MANAGER: peter, MANAGER: esther } = OPS_ACTORS;

const lot = (lotNo: string, garden: string, grade: string, packages: number, kgPer: number, pickupSite: string, saleNo?: string): TeaLot => ({ lotNo, garden, grade, packages, kg: packages * kgPer, pickupSite, saleNo });

export const buildFleetSeed = (): FleetExtState => {
  // Odometer and weight carried, closed by the driver at the end of each day
  const dailyLogs: DailyLog[] = [];
  let dl = 0;
  const logs = (vehicleId: string, driver: string, endKm: number, perDay: number[], kg: number[]) => {
    let close = endKm;
    for (let i = 0; i < perDay.length; i++) {
      const date = d(-(i + 1));
      if (!perDay[i]) continue;
      dailyLogs.push({ id: `dl${++dl}`, vehicleId, date, openKm: close - perDay[i], closeKm: close, kgCarried: kg[i % kg.length], driver, by: driver });
      close -= perDay[i];
    }
  };
  logs('v1', samuel.name, 182_430, [485, 0, 485, 160, 0, 312, 485, 0, 485, 45], [6_200, 0, 6_800, 3_400, 0, 5_100, 6_900, 0, 6_400, 1_200]);
  logs('v2', 'Joseph Mutua', 96_720, [312, 160, 0, 45, 485, 0, 160], [2_400, 2_100, 0, 900, 2_800, 0, 1_950]);
  logs('v4', 'Pool vehicle', 118_905, [120, 0, 60, 45, 0, 0, 160], [300, 0, 150, 0, 0, 0, 420]);

  return {
    routes: [
      {
        id: 'rt1',
        name: 'Mt Kenya East factories → Mombasa',
        ratePerKm: 95,
        stops: [
          { site: 'Kangaita tea factory (Kirinyaga)', type: 'FACTORY', seq: 1, km: 0 },
          { site: 'Ndima tea factory (Nyeri)', type: 'FACTORY', seq: 2, km: 38 },
          { site: 'Chinga tea factory (Othaya)', type: 'FACTORY', seq: 3, km: 71 },
          { site: 'Blending warehouse — Industrial Area, Nairobi', type: 'WAREHOUSE', seq: 4, km: 182 },
          { site: 'Changamwe tea warehouse, Mombasa', type: 'WAREHOUSE', seq: 5, km: 667 }
        ]
      },
      {
        id: 'rt2',
        name: 'Kericho highlands → Mombasa',
        ratePerKm: 95,
        stops: [
          { site: 'Kapkoros tea factory (Bomet)', type: 'FACTORY', seq: 1, km: 0 },
          { site: 'Momul tea factory (Kericho)', type: 'FACTORY', seq: 2, km: 34 },
          { site: 'Blending warehouse — Industrial Area, Nairobi', type: 'WAREHOUSE', seq: 3, km: 262 },
          { site: 'Changamwe tea warehouse, Mombasa', type: 'WAREHOUSE', seq: 4, km: 747 }
        ]
      },
      {
        id: 'rt3',
        name: 'Mombasa auction warehouses → port (shuttle)',
        ratePerKm: 160,
        stops: [
          { site: 'Siginon tea warehouse, Changamwe', type: 'BROKER', seq: 1, km: 0 },
          { site: 'Mitchell Cotts warehouse, Kipevu', type: 'BROKER', seq: 2, km: 7 },
          { site: 'Kilindini port — container yard', type: 'PORT', seq: 3, km: 14 }
        ]
      }
    ],
    plans: [
      {
        id: 'cp1',
        number: num('CP', 1),
        plannedDate: d(2),
        routeId: 'rt1',
        priority: 'HIGH',
        lots: [
          lot('KG-2611', 'Kangaita', 'BP1', 40, 65, 'Kangaita tea factory (Kirinyaga)', 'Sale 41'),
          lot('KG-2612', 'Kangaita', 'PF1', 38, 64, 'Kangaita tea factory (Kirinyaga)', 'Sale 41'),
          lot('ND-0877', 'Ndima', 'PF1', 30, 64, 'Ndima tea factory (Nyeri)', 'Sale 41'),
          lot('ND-0878', 'Ndima', 'PD', 20, 70, 'Ndima tea factory (Nyeri)', 'Sale 41'),
          lot('CH-1430', 'Chinga', 'BP1', 36, 65, 'Chinga tea factory (Othaya)', 'Sale 41'),
          lot('CH-1431', 'Chinga', 'DUST1', 16, 70, 'Chinga tea factory (Othaya)', 'Sale 41')
        ],
        status: 'DRAFT',
        allocations: [],
        budgetCost: 0,
        createdBy: mary.name,
        notes: 'Sale 41 purchases for the Dubai blend (BP1/PF1 heavy)',
        history: [h(d(0), 8, mary.name, 'Plan created')]
      },
      {
        id: 'cp2',
        number: num('CP', 2),
        plannedDate: d(0),
        routeId: 'rt3',
        priority: 'NORMAL',
        lots: [
          lot('SG-5521', 'Michimikuru', 'BP1', 60, 65, 'Siginon tea warehouse, Changamwe', 'Sale 40'),
          lot('SG-5522', 'Michimikuru', 'PF1', 54, 64, 'Siginon tea warehouse, Changamwe', 'Sale 40'),
          lot('MC-3307', 'Iriaini', 'PD', 40, 70, 'Mitchell Cotts warehouse, Kipevu', 'Sale 40')
        ],
        status: 'LOADING',
        allocations: [{ vehicleId: 'v6', kg: 10_000, hired: true, lots: ['SG-5521', 'SG-5522'], carrierCost: 4_480, instructionId: 'li1' }, { vehicleId: 'v7', kg: 2_800, hired: true, lots: ['MC-3307'], carrierCost: 5_040 }],
        budgetCost: 9_520,
        createdBy: mary.name,
        notes: 'Shuttle to the port for container stuffing (booking CB-0002)',
        history: [h(d(-1), 9, mary.name, 'Plan created'), h(d(-1), 11, peter.name, 'Vehicles allocated', 'KBZ 771H, KCP 340L (hired)'), h(d(0), 7, mary.name, 'Loading instruction LI-0001 issued')]
      },
      {
        id: 'cp3',
        number: num('CP', 3),
        plannedDate: d(-12),
        routeId: 'rt2',
        priority: 'NORMAL',
        lots: [lot('KP-7702', 'Kapkoros', 'BP1', 50, 65, 'Kapkoros tea factory (Bomet)', 'Sale 39'), lot('MO-1188', 'Momul', 'PF1', 44, 64, 'Momul tea factory (Kericho)', 'Sale 39')],
        status: 'CLOSED',
        allocations: [{ vehicleId: 'v1', kg: 6_066, hired: false, lots: ['KP-7702', 'MO-1188'] }],
        budgetCost: 141_930,
        createdBy: mary.name,
        notes: '',
        closedOn: d(-10),
        actualCost: 138_400,
        history: [h(d(-14), 9, mary.name, 'Plan created'), h(d(-13), 10, peter.name, 'Vehicles allocated'), h(d(-12), 6, samuel.name, 'Dispatched'), h(d(-10), 17, peter.name, 'Closed', 'Delivered to Changamwe')]
      }
    ],
    instructions: [
      {
        id: 'li1',
        number: num('LI', 1),
        planId: 'cp2',
        vehicleId: 'v6',
        driver: 'Haulier driver — Hassan Omar',
        routeId: 'rt3',
        teas: [
          { ...lot('SG-5521', 'Michimikuru', 'BP1', 60, 65, 'Siginon tea warehouse, Changamwe', 'Sale 40'), to: 'Kilindini port — container yard' },
          { ...lot('SG-5522', 'Michimikuru', 'PF1', 54, 64, 'Siginon tea warehouse, Changamwe', 'Sale 40'), to: 'Kilindini port — container yard' }
        ],
        status: 'ISSUED',
        issuedBy: mary.name,
        issuedAt: at(d(0), 7)
      }
    ],
    dailyLogs,
    defects: [
      {
        id: 'df1',
        number: num('DEF', 1),
        vehicleId: 'v3',
        driver: 'Ali Bakari',
        odometer: 141_380,
        date: d(-3),
        items: [
          { area: 'Brakes', description: 'Pedal goes almost to the floor; pulls left', severity: 'CRITICAL' },
          { area: 'Clutch', description: 'Slipping in 3rd and 4th under load', severity: 'MAJOR' }
        ],
        safetyCritical: true,
        status: 'APPROVED',
        woId: 'wo5',
        woNumber: num('WO', 5),
        decidedBy: peter.name,
        history: [h(d(-3), 17, 'Ali Bakari', 'Defect reported'), h(d(-2), 8, peter.name, 'Approved — vehicle off the road', `Work order ${num('WO', 5)}`)]
      },
      {
        id: 'df2',
        number: num('DEF', 2),
        vehicleId: 'v2',
        driver: 'Joseph Mutua',
        odometer: 96_700,
        date: d(-1),
        items: [
          { area: 'Lights', description: 'Nearside rear indicator not working', severity: 'MINOR' },
          { area: 'Tyres', description: 'Front left tyre worn to 2 mm', severity: 'MAJOR' }
        ],
        safetyCritical: false,
        status: 'SUBMITTED',
        history: [h(d(-1), 18, 'Joseph Mutua', 'Defect reported')]
      }
    ],
    policies: [
      { id: 'ip1', vehicleId: 'v1', insurer: 'APA Insurance', policyNo: 'APA/MV/7741902', cover: 'COMPREHENSIVE', premium: 186_000, start: d(-225), expiry: d(140), officer: peter.name, officerEmail: 'p.njoroge@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [] },
      { id: 'ip2', vehicleId: 'v2', insurer: 'Jubilee Allianz', policyNo: 'JAL/COM/552018', cover: 'COMPREHENSIVE', premium: 112_500, start: d(-155), expiry: d(210), officer: peter.name, officerEmail: 'p.njoroge@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [] },
      { id: 'ip3', vehicleId: 'v3', insurer: 'APA Insurance', policyNo: 'APA/MV/6620177', cover: 'COMPREHENSIVE', premium: 134_000, start: d(-353), expiry: d(12), officer: peter.name, officerEmail: 'p.njoroge@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [30] },
      { id: 'ip4', vehicleId: 'v4', insurer: 'CIC General', policyNo: 'CIC/PV/310984', cover: 'COMPREHENSIVE', premium: 98_000, start: d(-175), expiry: d(190), officer: mary.name, officerEmail: 'm.wambui@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [] },
      { id: 'ip5', vehicleId: 'v5', insurer: 'CIC General', policyNo: 'CIC/PV/310985', cover: 'TPFT', premium: 41_000, start: d(-105), expiry: d(260), officer: mary.name, officerEmail: 'm.wambui@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [] },
      { id: 'ip6', vehicleId: 'v1', insurer: 'APA Insurance', policyNo: 'APA/GIT/0099213', cover: 'GOODS_IN_TRANSIT', premium: 64_000, start: d(-340), expiry: d(25), officer: peter.name, officerEmail: 'p.njoroge@intergrated-erp.ke', status: 'ACTIVE', remindersSent: [] }
    ],
    requests: [
      {
        id: 'vr1',
        number: num('VR', 1),
        requestedBy: 'Grace Wanjiru',
        department: 'Finance',
        purpose: 'KRA iTax and bank visits — Upper Hill',
        type: 'ADMIN',
        from: d(1),
        to: d(1),
        route: 'Industrial Area → Upper Hill → Industrial Area',
        passengers: 2,
        kg: 0,
        status: 'REQUESTED',
        history: [h(d(0), 9, 'Grace Wanjiru', 'Requested')]
      },
      {
        id: 'vr2',
        number: num('VR', 2),
        requestedBy: esther.name,
        department: 'Operations',
        purpose: 'Garden visit — Kangaita leaf quality review',
        type: 'OPERATIONAL',
        from: d(0),
        to: d(1),
        route: 'Nairobi → Kerugoya → Nairobi',
        passengers: 3,
        kg: 50,
        status: 'APPROVED',
        decidedBy: peter.name,
        history: [h(d(-2), 10, esther.name, 'Requested'), h(d(-1), 8, peter.name, 'Approved')]
      }
    ],
    positions: {},
    letters: [
      {
        id: 'lt1',
        number: num('LTR', 1),
        template: 'AUTHORITY_TO_DRIVE',
        to: 'Samuel Ouma',
        toEmail: 's.ouma@intergrated-erp.ke',
        subject: 'Authority to drive — KCA 512Q',
        body: 'This letter authorises Samuel Ouma (driver) to drive company vehicle KCA 512Q (Isuzu FRR 7-tonne) on company business between Nairobi and Mombasa until further notice.',
        vehicleId: 'v1',
        status: 'SENT',
        signature: { by: peter.name, at: `${d(-20)} 10:05`, method: 'TYPED', text: peter.name, meaning: 'Approved and issued' },
        hash: '7A3F19C2',
        createdBy: mary.name,
        history: [h(d(-20), 9, mary.name, 'Drafted'), h(d(-20), 10, peter.name, 'Signed electronically'), h(d(-20), 10, peter.name, 'Sent by email')]
      }
    ],
    carriers: [
      { id: 'cr1', name: 'Pwani Haulage Ltd', email: 'dispatch@pwanihaulage.co.ke', phone: '+254 41 231 7700', ratePerKm: 160 },
      { id: 'cr2', name: 'Rift Logistics (K) Ltd', email: 'ops@riftlogistics.co.ke', phone: '+254 722 880 410', ratePerKm: 180 }
    ],
    sequence: { CP: 3, LI: 1, DEF: 2, VR: 2, LTR: 1 }
  };
};
