import { Avatar, Button, Card, Empty, Flex, Typography } from 'antd';
import type { DirectorProject } from '@sw/contracts';
import { useState } from 'react';
import { brand, space } from '../../theme/tokens.js';
import { compareArrival, rankedContacts, type BrandScope } from './project-register.js';
import { projectStyles } from './director-projects.styles.js';
import { ProjectDetail, ProjectList } from './ProjectList.js';

type Ranking = ReturnType<typeof rankedContacts>;
type Schedule = { brands: string[]; projects: DirectorProject[] };

export function DirectorProjects({ schedule, scope }: { readonly schedule: Schedule; readonly scope: BrandScope }) {
  const projects = schedule.projects.filter((p) => scope === 'all' || scope === `brand:${p.brand}`).sort(compareArrival);
  const [list, setList] = useState<{ contact?: string }>();
  const [detail, setDetail] = useState<DirectorProject>();
  const ranking = rankedContacts(projects);
  const unassigned = projects.filter((p) => !p.contact).length;
  const empty = schedule.brands.length ? '当前店铺没有新品排期记录' : '尚未接入开发中产品排期表';
  return <>
    <style>{projectStyles}</style>
    <section aria-label="员工负责事项"><Card title="员工负责事项" size="small">
      <Flex vertical gap={space[2]}>
        <Typography.Text type="secondary">按项目对接人负责的新品数量排名</Typography.Text>
        {ranking.length ? <RankingList rows={ranking} select={(contact) => setList({ contact })} /> : <Empty description="暂无已分配的新品项目" />}
        {unassigned ? <Button type="link" onClick={() => setList({ contact: '' })}>待分配 · {unassigned} 个项目</Button> : null}
      </Flex>
    </Card></section>
    <section aria-label="新品开发进度"><Card title="新品开发进度" size="small"
      extra={projects.length > 0 && <Button type="link" size="small" onClick={() => setList({})}>查看全部 {projects.length} 个</Button>}>
      {projects.length ? <Flex vertical gap={space[2]}>{projects.slice(0, 4).map((p) => <Flex key={p.brand + p.row} vertical gap={space[0]}>
        <Flex justify="space-between" align="baseline" gap={space[2]}>
          <Button type="link" className="director-project-link" onClick={() => setDetail(p)}>{p.name}</Button>
          <Typography.Text type="secondary" style={{ flexShrink: 0 }}>{p.contact || '待分配'}</Typography.Text>
        </Flex>
        {p.notes && <Typography.Text ellipsis title={p.notes}>{p.notes}</Typography.Text>}
        <Typography.Text type="secondary">预计入仓 · {p.arrival || '待填写'}</Typography.Text>
      </Flex>)}</Flex> : <Empty description={empty} />}
    </Card></section>
    {list && <ProjectList projects={projects} contact={list.contact} onClose={() => setList(undefined)} onProject={setDetail} />}
    {detail && <ProjectDetail project={detail} onClose={() => setDetail(undefined)} />}
  </>;
}

function RankingList({ rows, select }: { readonly rows: Ranking; readonly select: (contact: string) => void }) {
  const podium = rows.slice(0, 3);
  podium.sort((a, b) => podiumOrder(a.rank) - podiumOrder(b.rank));
  return <>
    <div className="director-podium">{podium.map((person) => <Button type="text" className="director-rank" data-rank={person.rank}
      key={person.name} aria-label={rankLabel(person)} onClick={() => select(person.name)}>
      <span className="director-medal"><Avatar size={42} style={{ background: brand[100], color: brand[800] }}>{person.name.slice(-2)}</Avatar>
        <span className="director-rank-number">{person.rank}</span></span>
      <Typography.Text ellipsis>{person.name}</Typography.Text><strong>{person.count} 个项目</strong>
    </Button>)}</div>
    {rows.length > 3 && <div className="director-rank-list" aria-label="其他项目对接人">
      {rows.slice(3).map((person) => <Button type="text" block key={person.name} className="director-rank-row"
        aria-label={rankLabel(person)} onClick={() => select(person.name)}>
        <span>{person.rank}</span><Avatar size="small">{person.name.slice(-1)}</Avatar>
        <span className="director-rank-name">{person.name}</span><span>{person.count} 个</span>
      </Button>)}</div>}
  </>;
}

function podiumOrder(rank: number) {
  return rank === 2 ? 0 : rank;
}

function rankLabel(person: Ranking[number]) {
  return `第 ${person.rank} 名 · ${person.name} · ${person.count} 个项目`;
}
