import { useEffect, useState } from 'react';
import {
  planBoard, planRows, todayViewOf,
  type DailyPlan, type GroupMode, type PlanLoad, type PlanRow, type TodayBoard,
} from '../../features/today/index.js';
import { loadDailyPlan, todayPlanDate } from '../../features/plan/index.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';

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
  const load = planLoadOf({ state: state.state, group, ownerId: isMine ? ownerId ?? '' : null });
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

function planLoadOf({ state, group, ownerId }: {
  readonly state: PlanViewLoad;
  readonly group: GroupMode;
  readonly ownerId: string | null;
}): PlanLoad {
  if (todayViewOf(group) !== 'schedule') return { kind: 'idle' };
  if (state.kind !== 'ready') return state;
  const view = ownerId === null ? state.view : personalPlan(state.view, ownerId);
  return { kind: 'ready', board: planBoard({ view, group: planGroupOf(group) }) };
}

function personalPlan(view: DailyPlan, ownerId: string): DailyPlan {
  const forOwner = (groups: DailyPlan['byOwner']) => groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.ownerUserId === ownerId) }))
    .filter((group) => group.items.length > 0);
  const items = view.items.filter((item) => item.ownerUserId === ownerId);
  return { ...view, items, total: items.length, overdueCount: items.filter((item) => item.overdueDays !== null).length,
    byOwner: forOwner(view.byOwner), bySupplier: forOwner(view.bySupplier), byFactory: forOwner(view.byFactory) };
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
