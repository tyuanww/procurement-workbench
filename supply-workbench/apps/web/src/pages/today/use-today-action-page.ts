import type { useSearchParams } from 'react-router';
import { actionFactoryParams, actionPageParams, actionSortParams, actionWorkParams, type ActionQuery } from './action-query.js';
import type { ActionPageControls } from './ActionControls.js';
import { useChaseCopy } from './today-copy.js';
import type { useTodayData } from './today-load.js';

export function useTodayActionPage({ query, search, setParams, today, isSettled }: {
  readonly query: ActionQuery;
  readonly search: string;
  readonly setParams: ReturnType<typeof useSearchParams>[1];
  readonly today: ReturnType<typeof useTodayData>;
  readonly isSettled: boolean;
}): ActionPageControls | undefined {
  const copy = useChaseCopy({ query, buyerName: today.data?.buyerName ?? '' });
  const paging = today.data?.paging;
  if (paging === undefined) return undefined;
  return {
    paging, sort: query.sort, work: query.work, inbox: query.inbox, calendar: query.calendar, isLoading: today.isLoading, isSettled, loadError: today.loadError,
    factoryId: new URLSearchParams(search).get('chaseFactory'),
    isFiltered: query.work !== undefined || query.reasons.length > 0 || query.sort.kind === 'bulk',
    onFactory: (id) => setParams(actionFactoryParams(search, id)),
    onPage: (page) => {
      const params = actionPageParams(search, page);
      params.delete('focusId');
      setParams(params);
    },
    onSort: (sort) => setParams(actionSortParams(search, sort)),
    onWork: (work) => setParams(actionWorkParams(search, work)),
    onRetry: today.retry,
    ...copy,
  };
}
