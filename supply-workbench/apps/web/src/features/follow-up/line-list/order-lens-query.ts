import { LocalDateSchema, OrderLineIdSchema, ProcurementStoreSchema } from '@sw/contracts';
import type { LocalDate, OrderLineId, ProcurementStore } from '@sw/domain';
import { followUpAddress } from './follow-up-address.js';

export type OrderLens = 'query' | 'delivery';
export const DELIVERY_QUERY_PARAM = 'deliveryQuery';
const ORDER_QUERY_PARAM = 'orderQuery';
const RISK_DATE = 'riskDate';
const RISK_LINE = 'riskLine';

type DeliveryRisk = {
  readonly store: ProcurementStore;
  readonly date: LocalDate;
  readonly ids: readonly OrderLineId[];
};

export function orderLensOf(params: URLSearchParams): OrderLens {
  return params.get('lens') === 'delivery' ? 'delivery' : 'query';
}

export function switchOrderLens(params: URLSearchParams, lens: OrderLens): URLSearchParams {
  if (lens === orderLensOf(params)) return new URLSearchParams(params);

  const current = activeQuery(params);
  if (lens === 'query') {
    const next = activeQuery(new URLSearchParams(params.get(ORDER_QUERY_PARAM) ?? ''));
    next.set(DELIVERY_QUERY_PARAM, current.toString());
    return next;
  }

  const saved = params.get(DELIVERY_QUERY_PARAM);
  const next = saved === null ? firstDeliveryQuery(current) : activeQuery(new URLSearchParams(saved));
  next.set('lens', 'delivery');
  if (current.size > 0) next.set(ORDER_QUERY_PARAM, current.toString());
  return next;
}

function firstDeliveryQuery(current: URLSearchParams) {
  const next = new URLSearchParams();
  for (const key of ['store', 'lane', 'buyer', 'scope']) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  return next;
}

function activeQuery(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['lens', ORDER_QUERY_PARAM, DELIVERY_QUERY_PARAM, 'focusLine']) next.delete(key);
  return next;
}

export function deliveryStoreOf(params: URLSearchParams): ProcurementStore | null {
  const lane = params.get('lane');
  if (lane !== null && lane !== 'finished' && lane !== 'all') return null;
  return ProcurementStoreSchema.safeParse(params.get('store') ?? 'all').data ?? null;
}

export function deliveryBuyerOf(params: URLSearchParams): 'all' | 'mine' | null {
  const scope = params.get('scope');
  const buyer = params.get('buyer');
  if (buyer !== null && buyer !== 'me') return null;
  if (scope === null) return buyer === null ? 'all' : 'mine';
  if (scope === 'mine' || (scope === 'all' && buyer === null)) return scope;
  return null;
}

export function homeDeliveryRiskOf(params: URLSearchParams): { kind: 'daily' } | { kind: 'invalid' } | ({ kind: 'home-risk' } & DeliveryRisk) {
  if (!params.has(RISK_DATE) && !params.has(RISK_LINE)) return { kind: 'daily' };
  const store = ProcurementStoreSchema.safeParse(params.get('store'));
  const date = LocalDateSchema.safeParse(params.get(RISK_DATE));
  const ids = params.getAll(RISK_LINE).map((id) => OrderLineIdSchema.safeParse(id));
  if (!store.success || !date.success || ids.length === 0 || ids.some((id) => !id.success)) return { kind: 'invalid' };
  return { kind: 'home-risk', store: store.data, date: date.data, ids: [...new Set(ids.flatMap((id) => id.success ? [id.data] : []))] };
}

export function homeDeliveryRiskAddress({ store, date, ids, returnQuery }: Omit<DeliveryRisk, 'ids'> & {
  readonly ids: readonly string[]; readonly returnQuery?: URLSearchParams;
}): string {
  const params = new URLSearchParams({ lens: 'delivery', store, [RISK_DATE]: date });
  for (const id of new Set(ids)) params.append(RISK_LINE, id);
  if (returnQuery !== undefined) for (const [key, value] of returnQuery) params.append(key, value);
  return followUpAddress('/lines', params);
}

export function dailyDeliveryParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of [RISK_DATE, RISK_LINE, 'focusLine']) next.delete(key);
  return next;
}

export function deliveryBackAddress(search: string): string {
  const params = new URLSearchParams(search);
  params.set('lens', 'delivery');
  return followUpAddress('/lines', params);
}
