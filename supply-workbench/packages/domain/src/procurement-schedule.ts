import { addDays, diffDays } from './dates.js';
import type { LocalDate } from './values/local-date.js';
import { entityId } from './values/ids.js';

export const PROCUREMENT_SCHEDULE_STAGES = ['order', 'materials', 'production', 'delivery'] as const;
export type ProcurementScheduleStage = (typeof PROCUREMENT_SCHEDULE_STAGES)[number];

export const PROCUREMENT_STAGE_LABELS: Readonly<Record<ProcurementScheduleStage, string>> = {
  order: '下单', materials: '齐料', production: '生产', delivery: '交付',
};

export const MAX_PROCUREMENT_PHASE_DAYS = 3650;

export type ProcurementCycle = {
  readonly materialsDays: number;
  readonly productionDays: number;
  readonly deliveryDays: number;
  readonly basis: string;
};

export function procurementStageId(orderLineId: string, stage: ProcurementScheduleStage) {
  return entityId(`procurement-schedule:${stage}:${orderLineId}`);
}

export function inclusiveScheduleDays(start: LocalDate | null, target: LocalDate | null): number | null {
  if (start === null || target === null) return null;
  const days = diffDays(target, start);
  return days < 0 ? null : days + 1;
}

export function procurementDraft({ orderOn, cycle }: { readonly orderOn: LocalDate; readonly cycle: ProcurementCycle }) {
  const materials = addDays(orderOn, cycle.materialsDays);
  const productionStart = addDays(materials, 1);
  const productionEnd = addDays(materials, cycle.productionDays);
  const delivery = addDays(productionEnd, cycle.deliveryDays);
  return {
    order: { start: orderOn, end: orderOn },
    materials: { start: materials, end: materials },
    production: { start: productionStart, end: productionEnd },
    delivery: { start: delivery, end: delivery },
  } satisfies Record<ProcurementScheduleStage, { readonly start: LocalDate; readonly end: LocalDate }>;
}
