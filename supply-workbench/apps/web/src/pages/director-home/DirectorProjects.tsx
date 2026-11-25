import { Avatar, Button, Card, Empty, Flex, Typography } from 'antd';
import type { DirectorProject } from '@sw/contracts';
import { useState } from 'react';
import { brand, space } from '../../theme/tokens.js';
import { compareArrival, rankedContacts, type BrandScope } from './project-register.js';
import { ProjectProgress } from './ProjectProgress.js';
import type { ProjectGroup } from './project-progress.js';
import { ProjectDetail, ProjectList } from './ProjectList.js';

type Ranking = ReturnType<typeof rankedContacts>;
type Schedule = { brands: string[]; projects: DirectorProject[] };

export function DirectorProjects({ schedule, scope, today }: { readonly today: string; readonly schedule: Schedule; readonly scope: BrandScope }) {
  const projects = schedule.projects.filter((p) => scope === 'all' || scope === `brand:${p.brand}`).sort(compareArrival);
  const [list, setList] = useState<ProjectGroup>();
  const [detail, setDetail] = useState<DirectorProject>();
  const ranking = rankedContacts(projects);
  const unassigned = projects.filter((p) => !p.contact).length;
  const empty = schedule.brands.length ? '当前店铺没有新品排期记录' : '尚未接入开发中产品排期表';
  const byContact = (contact: string) => setList({
    label: (contact || '待分配') + ' · 负责项目', projects: projects.filter((p) => p.contact === contact),
  });
  return <>
    <ProjectProgress projects={projects} today={today} empty={empty} onList={setList} onProject={setDetail} />
    <section className="director-staff" aria-label="员工负责事项"><Card size="small" title={<Flex align="baseline" gap={space[1]} wrap>
      <span>员工负责事项</span><Typography.Text type="secondary" className="director-caption">按项目对接人负责的新品数量排行</Typography.Text>
    </Flex>}>
      <Flex vertical gap={space[2]}>
        {ranking.length ? <RankingList rows={ranking} select={byContact} /> : <Empty description="暂无已分配的新品项目" />}
        {unassigned ? <Button type="link" onClick={() => byContact('')}>待分配 · {unassigned} 个项目</Button> : null}
      </Flex>
    </Card></section>
    {list && <ProjectList group={list} onClose={() => setList(undefined)} onProject={setDetail} />}
    {detail && <ProjectDetail project={detail} onClose={() => setDetail(undefined)} />}
  </>;
}

function RankingList({ rows, select }: { readonly rows: Ranking; readonly select: (contact: string) => void }) {
  const podium = rows.slice(0, 3);
  podium.sort((a, b) => podiumOrder(a.rank) - podiumOrder(b.rank));
  return <>
    <div className="director-podium">{podium.map((person) => <Button type="text" className="director-rank" data-rank={person.rank}
      key={person.name} aria-label={rankLabel(person)} onClick={() => select(person.name)}>
      <span className="director-medal"><Avatar size={36} style={{ background: brand[100], color: brand[800] }}>{person.name.slice(-2)}</Avatar>
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
