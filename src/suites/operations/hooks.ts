import type { WorkOrder } from './types';

/**
 * Extension points the core operations store calls into. The maintenance and fleet extension stores (mounted inside
 * OperationsProvider) register here, so core actions such as starting a trip or completing a work order still apply
 * their rules even when a screen calls the core action directly.
 */
export interface OpsHooks {
  /** Checks that a vehicle request may be used for a trip; returns the reason it may not. */
  tripRequest?: (requestId: string, vehicleId: string) => string | null;
  /** Steps, permit and hours from a job template, copied onto new work orders. */
  fromTemplate?: (templateId: string) => Partial<Pick<WorkOrder, 'checklist' | 'permitRequired' | 'estHours' | 'plannedParts'>> | null;
  /** A work order changed status (started, completed, signed off, cancelled). */
  woEvent?: (event: 'started' | 'completed' | 'accepted' | 'reworked' | 'cancelled', w: WorkOrder) => void;
}

export const opsHooks: OpsHooks = {};
