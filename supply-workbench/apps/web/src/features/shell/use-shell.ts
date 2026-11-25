import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FreshnessResponseSchema,
  ReviewCountsSchema,
  type ReviewCounts,
  type TodayResponse,
} from '@sw/contracts';
import { can, type Role } from '@sw/domain';
import { procurementCutoff } from './model/freshness.js';
import { apiGet, apiPostEmpty } from '../../shared/api/client.js';
import { listenToday, read, type ReadView } from '../../shared/api/reads.js';
import {
  todayScope,
  type QueueFacts,
  type TodayFacts,
} from './model/shell.js';

export type ShellLoadState = {
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
  readonly procurementDate: string | null;
};

const ReviewQueueContext = createContext<(() => Promise<void>) | null>(null);

export function useShellLoad(input: {
  readonly name: string;
  readonly roles: readonly Role[];
  readonly pathname: string;
}): ShellLoadState & { readonly refreshReviewQueue: () => Promise<void> } {
  const canReadReviewQueue = can(input, 'master.read');
  const [queue, setQueue] = useState<QueueFacts>({ kind: 'pending' });
  const [today, setToday] = useState<TodayFacts>({ kind: 'pending' });
  const procurementDate = useProcurementDate(input);
  const race = useRef(createQueueRace());
  const refreshReviewQueue = useCallback(async () => {
    if (!canReadReviewQueue) return;
    const next = await commitQueue({ race: race.current, read: readQueue });
    if (next !== null) setQueue(next);
  }, [canReadReviewQueue]);
  useShellRequests({ name: input.name, roles: input.roles, refreshReviewQueue, setToday });
  return { queue: canReadReviewQueue ? queue : { kind: 'unknown' }, today, procurementDate, refreshReviewQueue };
}

export function ReviewQueueProvider(props: { readonly refresh: () => Promise<void>; readonly children: ReactNode }): ReactNode {
  return createElement(ReviewQueueContext.Provider, { value: props.refresh }, props.children);
}

export function useRefreshReviewQueue(): () => Promise<void> {
  const refresh = useContext(ReviewQueueContext);
  if (refresh === null) throw new Error('审核队列只有壳层能刷新');
  return refresh;
}

export function createQueueRace(): { start(): number; isLatest(ticket: number): boolean } {
  let current = 0;
  return {
    start() {
      current += 1;
      return current;
    },
    isLatest(ticket) {
      return ticket === current;
    },
  };
}

export async function commitQueue(input: {
  readonly race: ReturnType<typeof createQueueRace>;
  readonly read: () => Promise<QueueFacts>;
}): Promise<QueueFacts | null> {
  const ticket = input.race.start();
  const next = await input.read();
  if (!input.race.isLatest(ticket)) return null;
  return next;
}

export async function endSession(): Promise<void> {
  await apiPostEmpty({ path: '/api/v1/auth/logout' });
  window.location.assign('/login');
}

function useShellRequests(input: {
  readonly name: string;
  readonly roles: readonly Role[];
  readonly refreshReviewQueue: () => Promise<void>;
  readonly setToday: (today: TodayFacts) => void;
}): void {
  const { name, roles, refreshReviewQueue, setToday } = input;
  useEffect(() => {
    let isCurrent = true;
    void refreshReviewQueue();
    const stopToday = listenToday({
      scope: todayScope({ roles }),
      onChange: (view) => {
        if (isCurrent) setToday(factsOf(view));
      },
    });
    return () => {
      isCurrent = false;
      stopToday();
    };
  }, [name, roles, refreshReviewQueue, setToday]);
}

async function readQueue(): Promise<QueueFacts> {
  try {
    return knownQueue(await apiGet('/api/v1/master/review-queue/counts', ReviewCountsSchema));
  } catch {
    return { kind: 'unknown' };
  }
}

function knownQueue(counts: ReviewCounts): QueueFacts {
  return {
    kind: 'known',
    aliases: counts.aliases,
    codes: counts.codes,
    links: counts.links,
    multiName: counts.multiName,
  };
}

export function loadShellToday(scope: 'mine' | 'all'): Promise<TodayFacts> {
  return read({ name: 'today', scope }).then(todayFacts, () => ({ kind: 'failed' }));
}

function factsOf(view: ReadView<TodayResponse>): TodayFacts {
  if (view.status === 'loading') return view.previous === null ? { kind: 'pending' } : todayFacts(view.previous);
  if (view.status === 'error') return { kind: 'failed' };
  return todayFacts(view.value);
}

function todayFacts(today: TodayResponse): TodayFacts {
  if (today.truncated) return { kind: 'truncated' };
  return { kind: 'complete', severities: today.items.map((item) => item.severity) };
}

function useProcurementDate({ name, pathname }: { readonly name: string; readonly pathname: string }): string | null {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    let isCurrent = true;
    void apiGet('/api/v1/meta/freshness', FreshnessResponseSchema).then((body) => {
      if (isCurrent) setDate(procurementCutoff(body.procurementUploadedAt));
    }, () => {
      if (isCurrent) setDate(null);
    });
    return () => { isCurrent = false; };
  }, [name, pathname]);
  return date;
}
