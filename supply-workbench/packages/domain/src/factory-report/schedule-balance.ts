export const SCHEDULE_LINK_REVIEW = 'SCHEDULE_LINK_REVIEW';

export type ScheduleBalance = {
  readonly ordered: number | null;
  readonly scheduled: number | null;
  readonly shipped: number | null;
  readonly received: number | null;
  readonly over: boolean;
};

/** 四个量各算各的。已排产只加日期格数量，超量只是提醒。 */
export function scheduleBalance(input: {
  readonly ordered: number | null;
  readonly scheduled: number | null;
  readonly shipped: number | null;
  readonly received: number | null;
}): ScheduleBalance {
  return {
    ordered: input.ordered,
    scheduled: input.scheduled,
    shipped: input.shipped,
    received: input.received,
    over: input.scheduled !== null && input.ordered !== null && input.scheduled > input.ordered,
  };
}

export function scheduledDayQty(cells: readonly { readonly linkStatus: string; readonly qty: number | null }[]): number | null {
  const kept = cells.filter((cell) => cell.linkStatus === 'linked' || cell.linkStatus === 'manual');
  const quantities = kept.flatMap((cell) => cell.qty === null ? [] : [cell.qty]);
  if (quantities.length === 0) return null;
  return quantities.reduce((sum, qty) => sum + qty, 0);
}
