/** Warehousing pages added for tea warehousing (lots, inbound, auction, outbound, transport, setup and reports). */
export type WarehousingExtPage = 'lots' | 'inbound' | 'auction' | 'outbound' | 'transport' | 'returns' | 'locations' | 'tasks' | 'cycle' | 'items' | 'billing' | 'printing' | 'sensors' | 'reports';

export const WH_EXT_LABEL: Record<WarehousingExtPage, string> = {
  lots: 'Tea lots',
  inbound: 'Inbound & yard',
  auction: 'Auction & warrants',
  outbound: 'Pick, pack & load',
  transport: 'Transport',
  returns: 'Returns (RMA)',
  locations: 'Locations & layout',
  tasks: 'Tasks',
  cycle: 'Count plans',
  items: 'Item setup',
  billing: 'Warehouse billing',
  printing: 'Printing jobs',
  sensors: 'Sensors (IoT)',
  reports: 'Reports'
};
export const isWarehousingExt = (p: string): p is WarehousingExtPage => p in WH_EXT_LABEL;
