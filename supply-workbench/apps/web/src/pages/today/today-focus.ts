import { useEffect } from 'react';
import type { useSearchParams } from 'react-router';
import type { TodayPaging } from '@sw/contracts';
import { fetchTodayPage } from '../../shared/api/catalog.js';
import { actionQuery, workspaceFocusParams, type ActionQuery } from './action-query.js';

export function workspaceRowId(id: string): string {
  return 'today-row-' + id;
}

export function focusLocation({ query, paging, asOf }: { readonly query: ActionQuery; readonly paging: TodayPaging | undefined; readonly asOf: string | undefined }) {
  if (query.focusId === null || paging?.focusInbox === undefined || query.inbox === undefined) return null;
  const isOtherInbox = paging.focusInbox !== query.inbox;
  const isOtherDay = needsFocusDay({ calendar: query.calendar, date: paging.focusDay, asOf });
  const isOtherWork = paging.focusWork !== undefined && paging.focusWork !== query.work;
  return isOtherInbox || isOtherDay || isOtherWork
    ? { id: query.focusId, destination: paging.focusInbox, date: paging.focusDay, work: paging.focusWork } : null;
}

function needsFocusDay({ calendar, date, asOf }: { readonly calendar: string | undefined; readonly date: string | undefined; readonly asOf: string | undefined }): boolean {
  const selected = calendar === 'today' ? asOf : calendar;
  return selected !== undefined && date !== undefined && selected !== date;
}

export function useWorkspaceFocus({ target, ready, search, query, paging, asOf, setParams }: {
  readonly target: string | null;
  readonly ready: boolean;
  readonly search: string;
  readonly query: ActionQuery;
  readonly paging: TodayPaging | undefined;
  readonly asOf: string | undefined;
  readonly setParams: ReturnType<typeof useSearchParams>[1];
}) {
  const location = ready ? focusLocation({ query, paging, asOf }) : null;
  const destination = location?.destination;
  const date = location?.date;
  const work = location?.work;
  const id = location?.id;
  useEffect(() => {
    if (id === undefined) return;
    setParams(workspaceFocusParams({ search, query, destination, date, work, id }), { replace: true });
  }, [id, destination, date, work, search, query, setParams]);
  useEffect(() => {
    if (target !== null && ready && id === undefined) document.getElementById(workspaceRowId(target))?.focus();
  }, [target, ready, id]);
  return location !== null;
}

export async function restoreReminderLocation({ id, search, query, onLocate }: {
  readonly id: string;
  readonly search: string;
  readonly query: ActionQuery;
  readonly onLocate: (params: URLSearchParams) => void;
}) {
  const location = await locateFollowUp({ id, inbox: query.inbox });
  if (location === null) return false;
  const next = workspaceFocusParams({ search, query, ...location });
  const nextQuery = actionQuery(next.toString());
  if (nextQuery.inbox === query.inbox && nextQuery.calendar === query.calendar && nextQuery.page === query.page && nextQuery.work === query.work) return false;
  onLocate(next);
  return true;
}

async function locateFollowUp({ id, inbox }: { readonly id: string; readonly inbox: ActionQuery['inbox'] }) {
  if (inbox === undefined) return null;
  try {
    const params = new URLSearchParams({ scope: 'mine', inbox, page: '1', pageSize: '1', focusId: id });
    const { paging } = await fetchTodayPage(params.toString());
    if (paging.focusInbox === undefined) return null;
    return { id, destination: paging.focusInbox, date: paging.focusDay, work: paging.focusWork };
  } catch {
    return null;
  }
}

export function focusSection(id: string): boolean {
  const target = document.getElementById(id);
  if (target === null) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
  return true;
}
