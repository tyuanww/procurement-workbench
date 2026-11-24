import {
  BuyerDrillSchema,
  DailyPlanSchema,
  LatestNotesSchema,
  LineOwnerOptionsSchema,
  LineSummarySchema,
  LineTimelineSchema,
  MeResponseSchema,
  OrderLineDetailSchema,
  OrderLineRowSchema,
  ProjectProgressSchema,
  ScheduleViewSchema,
  SupplierDashboardSchema,
  TodayChaseResponseSchema,
  TodayPageResponseSchema,
  TodayResponseSchema,
  WorkItemDetailSchema,
  listResponseSchema,
  type LineSummary,
  type LineTimeline,
  type ListResponse,
  type MeResponse,
  type OrderLineDetail,
  type OrderLineRow,
  type ProjectProgress,
  type ProcurementStore,
  type TodayResponse,
} from '@sw/contracts';
import type { z } from 'zod';
import { apiGetWithSignal, apiSend } from './client.js';
import { throwRead } from './failure.js';

export type LinesPage = ListResponse<OrderLineRow>;
export type PlanDaily = z.output<typeof DailyPlanSchema>;
export type PlanSchedule = z.output<typeof ScheduleViewSchema>;
export type PlanWorkItem = z.output<typeof WorkItemDetailSchema>;

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export function fetchMe(signal: AbortSignal): Promise<MeResponse> {
  return fetchOwned({ path: '/api/v1/me', schema: MeResponseSchema, signal });
}

export function fetchToday(path: string, signal: AbortSignal): Promise<TodayResponse> {
  return fetchOwned({ path, schema: TodayResponseSchema, signal });
}

export function fetchTodayPage(query: string, signal?: AbortSignal) {
  return fetchOwned({ path: `/api/v1/today?${query}`, schema: TodayPageResponseSchema, signal });
}

export function fetchTodayChase(query: string, signal: AbortSignal) {
  return fetchOwned({ path: `/api/v1/today/chase?${query}`, schema: TodayChaseResponseSchema, signal });
}

export function fetchSupplierWeek(query: URLSearchParams, signal: AbortSignal) {
  return fetchOwned({ path: `/api/v1/dashboard/suppliers?${query}`, schema: SupplierDashboardSchema, signal });
}

export function fetchBuyerDrill(query: URLSearchParams, signal: AbortSignal) {
  return fetchOwned({ path: `/api/v1/dashboard/buyers/drill?${query}`, schema: BuyerDrillSchema, signal });
}

export function fetchLines(query: string, signal: AbortSignal): Promise<LinesPage> {
  return fetchOwned({ path: `/api/v1/lines?${query}`, schema: listResponseSchema(OrderLineRowSchema), signal });
}

export function fetchLineOwners(signal: AbortSignal) {
  return fetchOwned({ path: '/api/v1/lines/owner-options', schema: LineOwnerOptionsSchema, signal });
}

export function fetchLinesSummary(query: string, signal: AbortSignal): Promise<LineSummary> {
  return fetchOwned({ path: `/api/v1/lines/summary?${query}`, schema: LineSummarySchema, signal });
}

export function lineReadPath(input: { readonly id: string; readonly store?: ProcurementStore }): string {
  const path = `/api/v1/lines/${encodeURIComponent(input.id)}`;
  return input.store === undefined ? path : `${path}?store=${input.store}`;
}

export function fetchLine(input: { readonly id: string; readonly store?: ProcurementStore; readonly signal: AbortSignal }): Promise<OrderLineDetail> {
  return fetchOwned({ path: lineReadPath(input), schema: OrderLineDetailSchema, signal: input.signal });
}

export function fetchLineTimeline(id: string, signal: AbortSignal): Promise<LineTimeline> {
  return fetchOwned({ path: `/api/v1/lines/${encodeURIComponent(id)}/timeline`, schema: LineTimelineSchema, signal });
}

export function fetchLatestNotes(orderLineIds: readonly string[]) {
  return apiSend({
    path: '/api/v1/follow-ups/latest-notes',
    method: 'POST',
    body: { orderLineIds },
    schema: LatestNotesSchema,
  });
}

export function fetchPlanDaily(date: string, signal: AbortSignal): Promise<PlanDaily> {
  return fetchOwned({ path: `/api/v1/plan/daily?date=${encodeURIComponent(date)}`, schema: DailyPlanSchema, signal });
}

export function planSchedulePath(input: { readonly from: string; readonly to: string; readonly store?: ProcurementStore }): string {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.store !== undefined && input.store !== 'all') params.set('store', input.store);
  return `/api/v1/plan/schedule?${params.toString()}`;
}

export function fetchPlanSchedule(input: { readonly from: string; readonly to: string; readonly store?: ProcurementStore; readonly signal: AbortSignal }): Promise<PlanSchedule> {
  const path = planSchedulePath(input);
  return fetchOwned({ path, schema: ScheduleViewSchema, signal: input.signal });
}

export function fetchPlanProgress(input: { readonly from: string; readonly to: string; readonly signal: AbortSignal }): Promise<ProjectProgress> {
  const path = `/api/v1/plan/progress?from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}&includeItems=true`;
  return fetchOwned({ path, schema: ProjectProgressSchema, signal: input.signal });
}

export function fetchPlanWorkItem(id: string, signal: AbortSignal): Promise<PlanWorkItem> {
  return fetchOwned({ path: `/api/v1/plan/work-items/${encodeURIComponent(id)}`, schema: WorkItemDetailSchema, signal });
}

async function fetchOwned<T>(input: { readonly path: string; readonly schema: Schema<T>; readonly signal: AbortSignal | undefined }): Promise<T> {
  try {
    const { path, schema, signal } = input;
    return await apiGetWithSignal({ path, schema, ...(signal === undefined ? {} : { signal }) });
  } catch (error) {
    throwRead(error);
  }
}
