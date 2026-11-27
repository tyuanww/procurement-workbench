import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { planningLabels, planningScope, type PlanningEntry } from '../../features/progress/index.js';
import { taskParam } from '../../features/today/index.js';
import type { PlanningDisplay, PlanningSource } from './planning-rows.js';

export { planningScope, planningSectionOf, type PlanningEntry } from '../../features/progress/index.js';

export const planningEntries = { orders: '/progress/schedule', development: '/progress/development' };

export const planningSections = [
  { key: 'orders', label: planningLabels.orders, to: planningEntries.orders },
  { key: 'development', label: planningLabels.development, to: planningEntries.development },
] satisfies readonly { readonly key: PlanningEntry; readonly label: string; readonly to: string }[];

export function planningSectionPath({ to, search }: { readonly to: PlanningEntry; readonly search: string }): string {
  const previous = new URLSearchParams(search);
  const next = new URLSearchParams();
  const store = previous.get('store');
  if (store !== null && !(to === 'development' && store === 'unassigned')) next.set('store', store);
  const pathname = planningEntries[to];
  return next.size === 0 ? pathname : `${pathname}?${next}`;
}

export function planningDisplay(params: URLSearchParams): PlanningDisplay {
  return params.get('planDisplay') === 'list' ? 'list' : 'gantt';
}

export function usePlanningNavigation(entry: PlanningEntry) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const trigger = usePlanningTrigger(params);
  const update = (next: URLSearchParams, options?: { readonly replace: boolean }) => setParams(next, { state, preventScrollReset: true, ...options });
  const write = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    update(next);
  };
  const open = (source: PlanningSource, triggerId: string) => {
    trigger.current = triggerId;
    const next = openSource(params, { source, isDevelopment: planningScope(params, entry) === 'development' });
    const selected = selectedRow(next);
    if (selected !== null) next.set('planSelected', selected);
    update(next);
  };
  const openOrder = (id: string, triggerId: string) => {
    trigger.current = triggerId;
    const next = new URLSearchParams(params);
    for (const key of ['drawer', 'taskMode', 'taskParent', 'riskReturn', 'procurementTask', 'developmentNode', 'developmentNodeProject', 'scheduleBatch', 'scheduleBatchEntry']) next.delete(key);
    next.set('scheduleLine', id);
    next.set('planSelected', `order:${id}`);
    update(next);
  };
  const closeOrder = () => {
    const next = new URLSearchParams(params);
    for (const key of ['scheduleLine', 'scheduleBatch', 'scheduleBatchEntry', 'procurementTask']) next.delete(key);
    update(next);
  };
  const closeDevelopment = () => {
    const next = new URLSearchParams(params);
    next.delete('developmentNode');
    next.delete('developmentNodeProject');
    next.delete('scheduleBatch');
    update(next);
  };
  return { params, update, write, open, openOrder, closeOrder, closeDevelopment };
}

function openSource(params: URLSearchParams, { source, isDevelopment }: {
  readonly source: PlanningSource; readonly isDevelopment: boolean;
}): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of ['drawer', 'taskMode', 'taskParent', 'riskReturn', 'procurementTask', 'developmentNode', 'developmentNodeProject', 'scheduleBatch', 'scheduleBatchEntry']) next.delete(key);
  switch (source.kind) {
    case 'task':
      next.set('drawer', taskParam(source.item.id));
      break;
    case 'development':
      next.set(isDevelopment ? 'developmentNodeProject' : 'developmentProject', source.project.id);
      next.set('developmentNode', source.node.id);
      break;
    case 'batch':
      next.set('scheduleBatch', source.batch.id);
      if (source.batch.node === undefined) {
        next.set('scheduleLine', source.batch.orderLineId);
        next.set('scheduleBatchEntry', '1');
      } else {
        next.set(isDevelopment ? 'developmentNodeProject' : 'developmentProject', source.batch.node.project.id);
        next.set('developmentNode', source.batch.node.node.id);
      }
      break;
  }
  return next;
}

export function planningRowTriggerId(rowId: string): string {
  return `planning-row:${rowId}`;
}

function selectedRow(params: URLSearchParams): string | null {
  const batch = params.get('scheduleBatch');
  if (batch !== null) return `batch:${batch}`;
  const task = params.get('drawer');
  if (task !== null) return task;
  const node = params.get('developmentNode');
  const project = params.get('developmentNodeProject') ?? params.get('developmentProject');
  if (node !== null && project !== null) return `development:${project}:${node}`;
  const order = params.get('scheduleLine');
  return order === null ? null : `order:${order}`;
}

function usePlanningTrigger(params: URLSearchParams) {
  const trigger = useRef<string | null>(null);
  const selection = selectedRow(params);
  const previous = useRef(selection);
  useEffect(() => {
    const before = previous.current;
    previous.current = selection;
    if (before === null || selection !== null) return;
    const clicked = trigger.current;
    trigger.current = null;
    const frame = window.requestAnimationFrame(() => {
      const target = (clicked === null ? null : document.getElementById(clicked))
        ?? document.getElementById(planningRowTriggerId(before));
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection]);
  return trigger;
}
