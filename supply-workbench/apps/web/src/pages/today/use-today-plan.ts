import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  planBoard, planRows, todayViewOf,
  type DailyPlan, type GroupMode, type PlanLoad, type PlanRow, type TodayBoard,
} from '../../features/today/index.js';
import { loadDailyPlan, todayPlanDate } from '../../features/plan/index.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { matchesScheduleFilter, readScheduleFilter, selectPlanItems, type ScheduleFilter } from './schedule-filter.js';

type PlanViewLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: DailyPlan }
  | { readonly kind: 'error'; readonly message: string };

export type MyPlan =
  | { readonly kind: 'idle' | 'loading' }
  | { readonly kind: 'ready'; readonly rows: readonly PlanRow[] }
  | { readonly kind: 'error'; readonly message: string };

export function useTodayPlan({ group, ownerId, isMine, shouldLoad }: {
  readonly group: GroupMode;
  readonly ownerId: string | null;
  readonly isMine: boolean;
  readonly shouldLoad: boolean;
}) {
  const state = useDailyPlan(shouldLoad);
  const mine = myPlanOf(state.state, ownerId);
  const [params] = useSearchParams();
  const load = planLoadOf({ state: state.state, group, ownerId: isMine ? ownerId ?? '' : null, filter: readScheduleFilter(params) });
  return { load, reload: state.reload, mine };
}

function useDailyPlan(isEnabled: boolean) {
  const [state, setState] = useState<PlanViewLoad>({ kind: 'idle' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!isEnabled) return;
    let isActive = true;
    setState((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    void loadDailyPlan(todayPlanDate())
      .then((view) => { if (isActive) setState({ kind: 'ready', view }); })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        setState({ kind: 'error', message: failure === null ? '排期加载失败' : failureText(failure) });
      });
    return () => { isActive = false; };
  }, [isEnabled, reload]);
  return { state, reload: () => setReload((value) => value + 1) };
}

function myPlanOf(state: PlanViewLoad, ownerId: string | null): MyPlan {
  if (ownerId === null) return { kind: 'idle' };
  if (state.kind !== 'ready') return state;
  return { kind: 'ready', rows: planRows(state.view.items.filter((item) => item.ownerUserId === ownerId), state.view.date) };
}

function planLoadOf({ state, group, ownerId, filter }: {
  readonly state: PlanViewLoad;
  readonly group: GroupMode;
  readonly ownerId: string | null;
  readonly filter: ScheduleFilter | undefined;
}): PlanLoad {
  if (todayViewOf(group) !== 'schedule') return { kind: 'idle' };
  if (state.kind !== 'ready') return state;
  const view = ownerId === null ? state.view : selectPlanItems(state.view, (item) => item.ownerUserId === ownerId);
  const mode = planGroupOf(group);
  const board = planBoard({ view, group: mode });
  if (filter === undefined || board.kind === 'empty') return { kind: 'ready', board };
  const matching = new Set(board.rows.filter((row) => matchesScheduleFilter(row, filter)).map((row) => row.workItemId));
  const filtered = selectPlanItems(view, (item) => matching.has(item.id));
  return { kind: 'ready', board: planBoard({ view: filtered, group: mode }), unfilteredRows: board.rows };
}

function planGroupOf(group: GroupMode): 'schedule' | 'owner' | 'supplier' {
  if (group === 'owner' || group === 'supplier') return group;
  return 'schedule';
}

export function sessionRows(input: { readonly board: TodayBoard; readonly plan: { readonly load: PlanLoad }; readonly myPlan?: MyPlan | undefined }): readonly { readonly id: string }[] {
  if (todayViewOf(input.board.group) === 'schedule') return planRowIds(input.plan.load);
  const rows = visibleRows(input.board);
  return input.myPlan?.kind === 'ready' ? [...rows, ...input.myPlan.rows] : rows;
}

function planRowIds(load: PlanLoad): readonly { readonly id: string }[] {
  if (load.kind !== 'ready' || load.board.kind !== 'groups') return [];
  return load.board.rows.map((row) => ({ id: row.id }));
}

function visibleRows(board: TodayBoard): readonly { readonly id: string }[] {
  if (board.body.kind !== 'groups') return [];
  return board.body.rows;
}
