import { Alert } from 'antd';
import type { WorkItemPredecessor } from '@sw/contracts';
import { hasWorkItemDependencyConflict } from '@sw/domain';
import type { WorkItemDetail } from '../today/index.js';
import { space } from '../../theme/tokens.js';

export function predecessorWarningText(predecessor: WorkItemPredecessor): string {
  return `${predecessor.title}（计划完成 ${predecessor.plannedEnd}）仍阻塞`;
}

export function TaskDependencyWarning({ detail }: { readonly detail: WorkItemDetail }) {
  const conflicts = detail.dependenciesIn.flatMap(({ kind, predecessor }) =>
    predecessor !== null && hasWorkItemDependencyConflict({ kind, predecessorStatus: predecessor.status, successorStatus: detail.item.status })
      ? [predecessor]
      : []);
  if (conflicts.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      title="依赖冲突"
      description={`本任务计划开始 ${detail.item.plannedStart}，${conflicts.map(predecessorWarningText).join('、')}`}
      style={{ marginBottom: space[3] }}
    />
  );
}
