import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { ProcurementStore, WorkItemPredecessor } from '@sw/contracts';
import { schedulePredecessorPath, scheduleRiskEntry, scheduleRiskLabel, scheduleRiskPath, scheduleTaskParentPath, type ScheduleWindow } from '../../features/progress/index.js';
import { taskIdOf, taskParam, type WorkItem } from '../../features/today/index.js';
import { useCan } from '../../shared/actor.js';
import { detailReturnState, useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { canPopToSource, riskHistoryIndex } from './schedule-risk-history.js';

export function useScheduleDrill({ store, items, visiblePredecessors }: {
  readonly store: ProcurementStore; readonly items: readonly WorkItem[]; readonly visiblePredecessors: readonly string[];
}) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const canReadPlan = useCan('plan.read');
  const origin = useScheduleTaskReturn();
  const requested = taskIdOf(params.get('drawer'));
  const id = canReadPlan && requested !== null && (store === 'all' || items.some((item) => item.id === requested)
    || visiblePredecessors.includes(requested)) ? requested : null;
  const isReadOnly = params.get('taskMode') === 'read';
  const write = (nextId: string | null): void => {
    if (nextId === null && isReadOnly && origin !== null) {
      if (origin.hasParent) releaseTaskFocus();
      if (origin.canPop) void navigate(-1);
      else void navigate(origin.to, { state: origin.state, replace: true });
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('taskMode');
    next.delete('taskParent');
    if (nextId === null) next.delete('drawer');
    else {
      next.delete('riskReturn');
      next.delete('procurementTask');
      next.set('drawer', nextId.startsWith('task:') ? nextId : taskParam(nextId));
    }
    setParams(next, isReadOnly && nextId === null ? { replace: true, state } : undefined);
  };
  return { id, isReadOnly, write };
}

function useScheduleTaskReturn() {
  const canSeeRisk = useCan('dashboard.read');
  const [params] = useSearchParams();
  const { pathname, search, state, key } = useLocation();
  const riskReturn = canSeeRisk ? params.get('riskReturn') : null;
  const parent = params.get('taskMode') === 'read' ? scheduleTaskParentPath(params, pathname) : null;
  if (parent === null && riskReturn === null) return null;
  const to = parent ?? scheduleRiskPath(new URLSearchParams(riskReturn ?? ''));
  const beforeOrder = restoreTaskState(state);
  const returnState = detailReturnState(beforeOrder, `${pathname}${search}`);
  return { to, state: returnState, canPop: returnState !== undefined && canPopToSource(beforeOrder, key), hasParent: parent !== null,
    label: parent === null ? `返回${scheduleRiskLabel}` : '返回上一项任务' };
}

function restoreTaskState(state: unknown): unknown {
  return typeof state === 'object' && state !== null && 'scheduleTaskOrigin' in state ? state.scheduleTaskOrigin : state;
}

export function ScheduleTaskReturnLink(): ReactNode {
  const origin = useScheduleTaskReturn();
  const navigate = useNavigate();
  if (origin === null) return null;
  const close = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (origin.hasParent) releaseTaskFocus();
    if (!origin.canPop) return;
    event.preventDefault();
    void navigate(-1);
  };
  return <Link to={origin.to} state={origin.state} replace={!origin.canPop} onClick={close}>{origin.label}</Link>;
}

function releaseTaskFocus(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

export function SchedulePredecessorLink({ predecessor, focusKey }: {
  readonly predecessor: WorkItemPredecessor; readonly focusKey?: string;
}): ReactNode {
  const [search] = useSearchParams();
  const { key, pathname } = useLocation();
  const to = schedulePredecessorPath({ predecessorId: predecessor.id, search, pathname });
  const focus = useDetailFocusLink(to, focusKey);
  const sourceIndex = riskHistoryIndex(key);
  const state = sourceIndex === null ? focus.state : { ...focus.state, riskSourceIndex: sourceIndex };
  useDetailReturnFocus(true, { allowContainerFocus: true });
  return <Link to={to} {...focus} state={state}>{predecessor.title}</Link>;
}

export function ManagementLink({ window }: { readonly window: ScheduleWindow }): ReactNode {
  const canSeeRisk = useCan('dashboard.read');
  const [search] = useSearchParams();
  const { pathname } = useLocation();
  const origin = useScheduleTaskReturn();
  if (!canSeeRisk) return null;
  if (origin !== null) return <ScheduleTaskReturnLink />;
  return <Link to={scheduleRiskEntry({ search, from: window.from, to: window.to, pathname })}>{scheduleRiskLabel}</Link>;
}
