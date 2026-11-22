import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FreshnessResponseSchema,
  ReviewCountsSchema,
  type FreshnessResponse,
  type ReviewCounts,
  type TodayResponse,
} from '@sw/contracts';
import { can, type Role } from '@sw/domain';
import { apiGet, apiPostEmpty } from '../../shared/api/client.js';
import { listenToday, read, type ReadView } from '../../shared/api/reads.js';
import {
  todayScope,
  type FreshnessFacts,
  type QueueFacts,
  type SourceFact,
  type TodayFacts,
} from './model/shell.js';

export type ShellLoadState = {
  readonly queue: QueueFacts;
  readonly today: TodayFacts;
  readonly freshness: FreshnessFacts;
  readonly now: string;
};

const ReviewQueueContext = createContext<(() => Promise<void>) | null>(null);

export function useShellLoad(input: {
  readonly name: string;
  readonly roles: readonly Role[];
}): ShellLoadState & { readonly refreshReviewQueue: () => Promise<void> } {
  const canReadReviewQueue = can(input, 'master.read');
  const [queue, setQueue] = useState<QueueFacts>({ kind: 'pending' });
  const [today, setToday] = useState<TodayFacts>({ kind: 'pending' });
  const [freshness, setFreshness] = useState<FreshnessFacts>({ kind: 'pending' });
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const race = useRef(createQueueRace());
  const refreshReviewQueue = useCallback(async () => {
    if (!canReadReviewQueue) return;
    const next = await commitQueue({ race: race.current, read: readQueue });
    if (next !== null) setQueue(next);
  }, [canReadReviewQueue]);
  useShellRequests({ name: input.name, roles: input.roles, refreshReviewQueue, setToday, setFreshness });
  return { queue: canReadReviewQueue ? queue : { kind: 'unknown' }, today, freshness, now, refreshReviewQueue };
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
  readonly setFreshness: (freshness: FreshnessFacts) => void;
}): void {
  const { name, roles, refreshReviewQueue, setToday, setFreshness } = input;
  useEffect(() => {
    let isCurrent = true;
    void refreshReviewQueue();
    const stopToday = listenToday({
      scope: todayScope({ roles }),
      onChange: (view) => {
        if (isCurrent) setToday(factsOf(view));
      },
    });
    void readFreshness().then((next) => {
      if (isCurrent) setFreshness(next);
    });
    return () => {
      isCurrent = false;
      stopToday();
    };
  }, [name, roles, refreshReviewQueue, setToday, setFreshness]);
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

async function readFreshness(): Promise<FreshnessFacts> {
  try {
    const body = await apiGet('/api/v1/meta/freshness', FreshnessResponseSchema);
    return { kind: 'ready', sources: body.sources.map(sourceFact) };
  } catch {
    return { kind: 'failed' };
  }
}

function sourceFact(source: FreshnessResponse['sources'][number]): SourceFact {
  return {
    template: source.template,
    factoryPartyId: source.factoryPartyId,
    label: source.label,
    lastCommittedAt: source.lastCommittedAt,
    fileModifiedAt: source.fileModifiedAt,
  };
}
