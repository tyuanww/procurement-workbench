import { Button, Card, Empty, Flex, Progress, Typography } from 'antd';
import type { DirectorProject } from '@sw/contracts';
import { brand, space } from '../../theme/tokens.js';
import { arrivalGroups, projectFocus, type ProjectGroup } from './project-progress.js';

export function ProjectProgress({ projects, today, empty, onList, onProject }: {
  readonly projects: DirectorProject[]; readonly today: string; readonly empty: string;
  readonly onList: (group: ProjectGroup) => void; readonly onProject: (project: DirectorProject) => void;
}) {
  const focus = projectFocus(projects, today);
  return <section className="director-development" aria-label="新品开发进度"><Card title="新品开发进度" size="small"
    extra={projects.length > 0 && <Button type="link" size="small"
      onClick={() => onList({ label: '全部新品项目', projects })}>查看全部 {projects.length} 个</Button>}>
    {focus ? <Flex vertical gap={space[2]}>
      <div className="director-project-focus">
        <Typography.Text type="secondary" className="director-caption">先跟这件 · {focus.reason}</Typography.Text>
        <Typography.Text strong>{focus.action}</Typography.Text>
        <Flex align="baseline" wrap gap={space[1]}>
          <Button type="link" className="director-project-link" onClick={() => onProject(focus.project)}>{focus.project.name}</Button>
          <Typography.Text type="secondary">对接人 · {focus.project.contact || '待分配'}</Typography.Text>
        </Flex>
      </div>
      <ArrivalChart groups={arrivalGroups(projects, today)} onList={onList} />
    </Flex> : <Empty description={empty} />}
  </Card></section>;
}

function ArrivalChart({ groups, onList }: { readonly groups: ProjectGroup[]; readonly onList: (group: ProjectGroup) => void }) {
  const max = Math.max(1, ...groups.map((g) => g.projects.length));
  return <div role="group" aria-label="按预计入仓月份查看新品">
    <Typography.Text type="secondary" className="director-caption">预计入仓分布 · 产品数</Typography.Text>
    <div className="director-arrival-rows">{groups.map((g) => <Button key={g.label} type="text" block
      className="director-arrival-row" aria-label={g.label + ' · ' + g.projects.length + ' 个产品'}
      title={g.label + ' · 查看 ' + g.projects.length + ' 个产品'} onClick={() => onList(g)}>
      <span>{g.label}</span><Progress aria-hidden="true" percent={100 * g.projects.length / max}
        showInfo={false} size={['100%', 6]} strokeColor={brand[600]} />
      <span>{g.projects.length}</span>
    </Button>)}</div>
  </div>;
}
