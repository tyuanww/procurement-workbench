import { useEffect, useState } from 'react';
import {
  planBoard, todayViewOf,
  type DailyPlan, type GroupMode, type PlanLoad, type TodayBoard,
} from '../../features/today/index.js';
import { loadDailyPlan, todayPlanDate } from '../../features/plan/index.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';

type PlanViewLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: DailyPlan }
  | { readonly kind: 'error'; readonly message: string };

export function useTodayPlan(group: GroupMode): { readonly load: PlanLoad; readonly reload: () => void } {
  const [state, setState] = useState<PlanViewLoad>({ kind: 'idle' });
  const [reload, setReload] = useState(0);
  const isSchedule = todayViewOf(group) === 'schedule';
  useEffect(() => {
    if (!isSchedule) return;
    let isActive = true;
    setState((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    void loadDailyPlan(todayPlanDate())
      .then((view) => { if (isActive) setState({ kind: 'ready', view }); })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        setState({ kind: 'error', message: failureText(failure) });
      });
    return () => { isActive = false; };
  }, [isSchedule, reload]);
  return { load: planLoadOf({ state, group }), reload: () => setReload((value) => value + 1) };
}

function planLoadOf(input: { readonly state: PlanViewLoad; readonly group: GroupMode }): PlanLoad {
  if (todayViewOf(input.group) !== 'schedule') return { kind: 'idle' };
  if (input.state.kind !== 'ready') return input.state;
  return { kind: 'ready', view: input.state.view, board: planBoard({ view: input.state.view, group: planGroupOf(input.group) }) };
}

function planGroupOf(group: GroupMode): 'schedule' | 'owner' | 'supplier' {
  if (group === 'owner' || group === 'supplier') return group;
  return 'schedule';
}

export function sessionRows(input: { readonly board: TodayBoard; readonly plan: { readonly load: PlanLoad } }): readonly { readonly id: string }[] {
  if (todayViewOf(input.board.group) === 'schedule') return planRowIds(input.plan.load);
  return visibleRows(input.board);
}

function planRowIds(load: PlanLoad): readonly { readonly id: string }[] {
  if (load.kind !== 'ready' || load.board.kind !== 'groups') return [];
  return load.board.rows.map((row) => ({ id: row.id }));
}

function visibleRows(board: TodayBoard): readonly { readonly id: string }[] {
  if (board.body.kind !== 'groups') return [];
  return board.body.rows;
}
