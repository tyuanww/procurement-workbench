import { expect, it } from 'vitest';
import { WORK_ITEM_STATUSES, WORK_ITEM_TRANSITIONS, canTransitionWorkItem, type WorkItemStatus } from '../../packages/domain/src/entities/work-items.js';
import { assertWorkItemTransition } from '../../packages/application/src/plan/policies/state-machine.js';

const EXPECTED: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: ['cancelled'],
  cancelled: [],
};

it('状态机允许 P3 规定的全部合法迁移', () => {
  for (const from of WORK_ITEM_STATUSES) {
    expect(WORK_ITEM_TRANSITIONS[from]).toEqual(EXPECTED[from]);
    for (const to of EXPECTED[from]) {
      expect(canTransitionWorkItem(from, to), `${from}->${to}`).toBe(true);
      expect(() => { assertWorkItemTransition(from, to); }).not.toThrow();
    }
  }
});

it('至少四条非法迁移被拒绝：planned->done、in_progress->planned、blocked->done、done->planned', () => {
  const illegal: readonly (readonly [WorkItemStatus, WorkItemStatus])[] = [
    ['planned', 'done'],
    ['in_progress', 'planned'],
    ['blocked', 'done'],
    ['done', 'planned'],
    ['done', 'in_progress'],
    ['cancelled', 'planned'],
    ['cancelled', 'in_progress'],
    ['planned', 'blocked'],
  ];
  for (const [from, to] of illegal) {
    expect(canTransitionWorkItem(from, to), `${from}->${to}`).toBe(false);
    expect(() => { assertWorkItemTransition(from, to); }).toThrow();
  }
  expect(() => { assertWorkItemTransition('planned', 'planned'); }).toThrow();
});
