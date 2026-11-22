import { canTransitionWorkItem, type WorkItemStatus } from '../../../../domain/src/entities/work-items.js';
import { StateConflictError } from '../../shared/errors.js';

/** P3 状态机：只允许 planned→in_progress→blocked|done、blocked→in_progress、任意→cancelled。 */
export function assertWorkItemTransition(from: WorkItemStatus, to: WorkItemStatus): void {
  if (canTransitionWorkItem(from, to)) return;
  throw new StateConflictError(`${from}->${to}`);
}
