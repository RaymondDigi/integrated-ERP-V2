/** Shipping pages added for shipping instructions, external tracking, bonds, charges and documents. */
export type ShippingExtPage = 'instructions' | 'tracking' | 'vessels' | 'bonds' | 'charges' | 'trucks' | 'licences' | 'templates' | 'reports' | 'kpis';

export const SHP_EXT_LABEL: Record<ShippingExtPage, string> = {
  instructions: 'Shipping instructions',
  tracking: 'External tracking',
  vessels: 'Vessel schedule',
  bonds: 'Bonds',
  charges: 'Charges & landed cost',
  trucks: 'Truck bookings',
  licences: 'Customs licences',
  templates: 'Document templates',
  reports: 'Reports',
  kpis: 'SI KPIs'
};
export const isShippingExt = (p: string): p is ShippingExtPage => p in SHP_EXT_LABEL;
