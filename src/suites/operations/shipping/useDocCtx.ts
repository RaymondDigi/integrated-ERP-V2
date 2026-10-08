import { useApp } from '../../../context/AppContext';
import { useWarehouseExt } from '../warehousing/store';
import type { DocCtx } from './docTemplates';
import { TEMPLATES } from './docTemplates';
import { useShippingExt } from './store';
import { printDocument } from '../../../platform/Widgets';

/** The shared part of every document context: company, template settings and the warehouse records. */
export const useDocCtx = () => {
  const { activeTenant, activeTenantSettings } = useApp();
  const wh = useWarehouseExt();
  const shp = useShippingExt();
  const base: DocCtx = {
    settings: shp.state.templates,
    company: activeTenantSettings?.legalName || activeTenant?.name || 'Company',
    lots: wh.state.lots,
    moves: wh.state.lotMoves,
    locations: wh.state.locations,
    msds: wh.state.setup.msds,
    whName: wh.whName,
    partyName: wh.partyName
  };
  const render = (key: string, extra: Partial<DocCtx>) => TEMPLATES.find((t) => t.key === key)!.render({ ...base, ...extra });
  const print = (key: string, title: string, extra: Partial<DocCtx>) => printDocument(title, render(key, extra));
  return { base, render, print };
};
