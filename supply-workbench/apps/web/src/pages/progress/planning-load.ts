import { useCallback, useEffect, useState } from 'react';
import type { OrderLineDetail, OrderLineRow, ProcurementStore, ProductDevelopment, ScheduleViewSchema } from '@sw/contracts';
import type { ProductDevelopmentStore } from '@sw/domain';
import type { z } from 'zod';
import type { ScheduleWindow } from '../../features/progress/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { failureText, read, readFailureOf, type ReadFailure } from '../../shared/api/reads.js';
import { loadProgressLines } from './progress-load.js';
import { onDevelopmentChange, readDevelopment } from './product-development-api.js';

export type DevelopmentStore = ProductDevelopmentStore | 'all';
type ScheduleView = z.output<typeof ScheduleViewSchema>;
export type PlanningLoad<T> = { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: T; readonly isRefreshing: boolean; readonly notice: string | null }
  | { readonly kind: 'error'; readonly message: string };

export function useScheduleLoad({ from, to }: ScheduleWindow, { store, includeDelivery = false }: {
  readonly store: ProcurementStore | null;
  readonly includeDelivery?: boolean;
}) {
  return usePlanningResource<ScheduleView>({
    key: store === null ? null : `${store}:${from}:${to}:${includeDelivery}`,
    request: (signal) => read({ name: 'planSchedule', from, to, store: store ?? 'all', includeClosed: true, includeDelivery, signal }),
    fallback: '读取订单排期失败',
  });
}

export function useDevelopment(store: DevelopmentStore | null) {
  const resource = usePlanningResource<ProductDevelopment>({
    key: store,
    request: (signal) => readDevelopment(store ?? 'all', signal),
    fallback: '读取新品排期失败',
  });
  useEffect(() => store === null ? undefined : onDevelopmentChange(resource.reload), [resource.reload, store]);
  return resource;
}

export function usePlanningOrders(store: ProcurementStore, shouldLoad: boolean) {
  return usePlanningResource<readonly OrderLineRow[]>({
    key: shouldLoad ? store : null,
    request: (signal) => loadProgressLines({ store, isMine: false, signal }),
    fallback: '读取成品订单失败',
  });
}

export function useSelectedPlanningOrder(store: ProcurementStore, id: string | null) {
  return usePlanningResource<OrderLineDetail>({
    key: id === null ? null : `${store}:${id}`,
    request: (signal) => read({ name: 'line', id: id ?? '', store, signal }),
    fallback: '读取成品订单失败',
  });
}

type ResourceInput<T> = {
  readonly key: string | null;
  readonly request: (signal: AbortSignal) => Promise<T>;
  readonly fallback: string;
};

function usePlanningResource<T>({ key, request, fallback }: ResourceInput<T>) {
  const [result, setResult] = useState<{ readonly key: string | null; readonly load: PlanningLoad<T> }>({ key, load: { kind: 'loading' } });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    setResult((current) => ({
      key, load: current.key === key && current.load.kind === 'ready'
        ? { ...current.load, isRefreshing: true, notice: null } : { kind: 'loading' },
    }));
    void request(controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, load: { kind: 'ready', data, isRefreshing: false, notice: null } });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const failure = readFailureOf(error);
      const message = failure === null ? apiErrorMessage(error) ?? fallback : failureText(failure);
      setResult((current) => ({ key, load: current.key === key && current.load.kind === 'ready' && canKeepPrevious(failure)
        ? { ...current.load, isRefreshing: false, notice: message } : { kind: 'error', message } }));
    });
    return () => controller.abort();
  }, [fallback, key, revision]);
  const load: PlanningLoad<T> = result.key === key ? result.load : { kind: 'loading' };
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { load, reload };
}

function canKeepPrevious(failure: ReadFailure | null): boolean {
  return failure?.kind !== 'api' || (failure.code !== 'UNAUTHENTICATED' && failure.code !== 'FORBIDDEN' && failure.code !== 'NOT_FOUND');
}
