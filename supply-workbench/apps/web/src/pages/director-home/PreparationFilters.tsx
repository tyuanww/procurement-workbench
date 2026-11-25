import { Button, Flex, Typography } from 'antd';
import { space } from '../../theme/tokens.js';
import type { DirectorProject } from '@sw/contracts';
import { preparationFields } from './project-progress.js';

type Field = (typeof preparationFields)[number]['key'];
export type PreparationFilter = { key: Field; status: string };

function statusOf(project: DirectorProject, key: Field) {
  const value = project.milestones[key].trim();
  return value && value !== '/' ? value : '未填';
}

export function matchesPreparation(project: DirectorProject, filter: PreparationFilter | undefined) {
  return filter === undefined || statusOf(project, filter.key) === filter.status;
}

export function PreparationFilters({ projects, filter, select }: {
  readonly projects: DirectorProject[]; readonly filter: PreparationFilter | undefined;
  readonly select: (filter: PreparationFilter | undefined) => void;
}) {
  return <Flex vertical gap={space[0]} role="group" aria-label="入仓准备情况">{preparationFields.map(({ key, label }) => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const status = statusOf(p, key);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return <Flex key={key} align="center" wrap gap={space[1]}>
      <Typography.Text style={{ minWidth: 72 }}>{label}</Typography.Text>
      {[...counts].map(([status, count]) => {
        const isSelected = filter?.key === key && filter.status === status;
        return <Button key={status} size="small" type={isSelected ? 'primary' : 'default'} aria-pressed={isSelected}
          aria-label={label + ' · ' + status + ' ' + count + ' 个'} onClick={() => select(isSelected ? undefined : { key, status })}>
          {status} {count}
        </Button>;
      })}
    </Flex>;
  })}</Flex>;
}
