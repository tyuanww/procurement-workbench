import { useEffect, useState } from 'react';
import type { TodayPageResponse, TodayPaging } from '@sw/contracts';
import { fetchTodayPage } from '../../shared/api/catalog.js';
import { actionPageSearch, actionQuery, CALENDAR_RETURN, type ActionQuery } from './action-query.js';
import type { MyPlan } from './use-today-plan.js';

type BusinessDayRead = Pick<TodayPageResponse, 'asOf'> & { readonly paging: TodayPaging };
type BusinessDay = { readonly day: string; readonly count: number; readonly pendingCount: number | undefined };
type Snapshot = { readonly path: string; readonly day: BusinessDay };
export type CalendarBusinessDayPreview = { readonly notice: CalendarBusinessDayNotice | undefined; readonly hasError: boolean };
export type CalendarBusinessDayNotice = { readonly day: string; readonly count: number; readonly isPartial: boolean };

export function useCalendarBusinessDay({ search, query, current, myPlan }: {
  readonly search: string;
  readonly query: ActionQuery;
  readonly current: BusinessDayRead | null;
  readonly myPlan: MyPlan;
}): CalendarBusinessDayPreview | undefined {
  const origin = query.inbox === 'scheduled' ? new URLSearchParams(search).get(CALENDAR_RETURN) : null;
  const path = businessDayPath(query, origin);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [failedPath, setFailedPath] = useState<string>();

  useEffect(() => {
    if (path === undefined || current === null) return;
    if (origin === null) {
      const day = readBusinessDay(current);
      if (day !== undefined) setSnapshot({ path, day });
      return;
    }

    const request = new AbortController();
    setFailedPath(undefined);
    void fetchTodayPage(path, request.signal).then((value) => {
      const day = readBusinessDay(value);
      if (!request.signal.aborted && day !== undefined) setSnapshot({ path, day });
    }).catch(() => {
      if (!request.signal.aborted) setFailedPath(path);
    });
    return () => request.abort();
  }, [path, current, origin]);

  if (origin === null || path === undefined) return undefined;
  const day = snapshot?.path === path ? snapshot.day : undefined;
  return { notice: businessDayNotice({ path, day, myPlan }), hasError: failedPath === path };
}

function businessDayPath(query: ActionQuery, origin: string | null): string | undefined {
  if (query.calendar === undefined || (origin === null && query.inbox !== 'today')) return undefined;
  const params = new URLSearchParams(origin ?? '');
  params.set('inbox', 'today');
  const source = origin === null ? query : actionQuery(params.toString());
  const path = new URLSearchParams(actionPageSearch({ ...source, calendar: 'today', page: 1 }));
  path.delete('calendarFollowUps');
  path.set('pageSize', '1');
  return path.toString();
}

function readBusinessDay({ asOf, paging }: BusinessDayRead): BusinessDay | undefined {
  if (paging.calendar?.date.slice(0, 7) !== asOf.slice(0, 7)) return undefined;
  const count = paging.calendar.days.find(({ date }) => date === asOf)?.count ?? 0;
  return { day: asOf, count, pendingCount: paging.pendingCount };
}

function businessDayNotice({ path, day: read, myPlan }: {
  readonly path: string;
  readonly day: BusinessDay | undefined;
  readonly myPlan: MyPlan;
}): CalendarBusinessDayNotice | undefined {
  if (read === undefined) return undefined;
  const { day, count, pendingCount } = read;
  const filters = new URLSearchParams(path);
  if (['work', 'reasons', 'sort'].some((key) => filters.has(key))) return { day, count, isPartial: false };
  if (pendingCount === undefined || myPlan.kind === 'idle' || myPlan.kind === 'loading') return undefined;
  const tasks = myPlan.kind === 'ready' ? myPlan.rows.length : 0;
  return { day, count: count + pendingCount + tasks, isPartial: myPlan.kind === 'error' };
}
