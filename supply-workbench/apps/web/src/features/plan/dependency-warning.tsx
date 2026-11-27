import { Alert } from 'antd';
import type { WorkItemPredecessor } from '@sw/contracts';
import { hasWorkItemDependencyConflict } from '@sw/domain';
import type { ReactNode } from 'react';
import type { WorkItemDetail } from '../today/index.js';
import { space } from '../../theme/tokens.js';

export function predecessorWarningText(predecessor: WorkItemPredecessor): string {
  return `${predecessor.title}${predecessorWarningSuffix(predecessor)}`;
}

function predecessorWarningSuffix(predecessor: WorkItemPredecessor): string {
  return `（计划完成 ${predecessor.plannedEnd}）仍阻塞`;
}

export function TaskDependencyWarning({ detail, predecessorLink }: {
  readonly detail: WorkItemDetail;
  readonly predecessorLink: ((predecessor: WorkItemPredecessor) => ReactNode) | undefined;
}) {
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
      description={<>本任务计划开始 {detail.item.plannedStart}，{conflicts.map((predecessor, index) =>
        <span key={predecessor.id}>{index === 0 ? null : '、'}
          {predecessorLink === undefined ? predecessor.title : predecessorLink(predecessor)}
          {predecessorWarningSuffix(predecessor)}
        </span>)}</>}
      style={{ marginBottom: space[3] }}
    />
  );
}
