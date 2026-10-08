import { useMemo } from 'react';
import { useOperations } from '../store';
import { useBlending } from './store';
import { buildJobs, DEFAULT_SCHED, schedule, type SchedOptions } from './engine';
import type { CalendarException, WorkCenter } from './types';

/** Live jobs and their schedule, recomputed whenever batches, blends, capacity or orders change. */
export const useLiveSchedule = (opts: SchedOptions = DEFAULT_SCHED, override?: { workCenters: WorkCenter[]; calendar: CalendarException[]; moves?: { jobId: string; date?: string; workCenterId?: string }[] }) => {
  const { state: ops, products, commercial } = useOperations();
  const { state } = useBlending();
  const orders = commercial.state.orders;
  const pos = commercial.state.purchaseOrders;
  return useMemo(() => {
    const jobs = buildJobs(state, ops, products, orders, pos).map((j) => {
      const m = override?.moves?.find((x) => x.jobId === j.id);
      if (!m) return j;
      return {
        ...j,
        release: m.date ?? j.release,
        ops: j.ops.map((o) => (m.workCenterId && (o.kind === 'PACKING' || (j.kind === 'BLEND' && o.kind === 'PROCESS')) ? { ...o, wcId: m.workCenterId } : o))
      };
    });
    const wcs = override?.workCenters ?? state.workCenters;
    const cal = override?.calendar ?? state.calendar;
    return { jobs, sched: schedule(jobs, wcs, cal, opts), wcs, cal };
  }, [state, ops, products, orders, pos, opts, override]);
};
