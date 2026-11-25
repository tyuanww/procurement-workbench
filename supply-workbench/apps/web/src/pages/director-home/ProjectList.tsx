import { Button, Descriptions, Drawer, Flex, Input, Table, Typography, type TableColumnsType } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { SCHEDULE_MILESTONES, type DirectorProject } from '@sw/contracts';
import { useState } from 'react';
import { drawerWide, space } from '../../theme/tokens.js';
import { matchesPreparation, PreparationFilters, type PreparationFilter } from './PreparationFilters.js';
import type { ProjectGroup } from './project-progress.js';
import { compareArrival } from './project-register.js';

function projectColumns(open: (project: DirectorProject) => void): TableColumnsType<DirectorProject> {
  return [
    { title: '产品名称', rowScope: 'row', sorter: (a, b) => a.name.localeCompare(b.name, 'zh-CN'),
      render: (_, p) => <Button type="link" className="director-project-link" onClick={() => open(p)}>{p.name}</Button> },
    { title: '店铺', dataIndex: 'brand', width: 88 },
    { title: '项目对接人', width: 102, render: (_, p) => p.contact || '待分配' },
    { title: '预计入仓时间', sorter: compareArrival, render: (_, p) => p.arrival || '待填写', width: 130 },
    { title: '主要事项', render: (_, p) => p.notes || '—' },
  ];
}

export function ProjectList({ group, onProject, onClose }: {
  readonly group: ProjectGroup;
  readonly onProject: (project: DirectorProject) => void; readonly onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [preparation, setPreparation] = useState<PreparationFilter>();
  const query = search.trim().toLocaleLowerCase();
  const filtered = group.projects.filter((p) => matchesPreparation(p, preparation) && [p.name, p.contact, p.brand, p.notes, p.arrival].some((s) => s.toLocaleLowerCase().includes(query)));
  return <Drawer open title={group.label} size={`min(${drawerWide}px, 100vw)`} onClose={onClose}>
    <Flex vertical gap={space[3]}>
      {group.showPreparation && <PreparationFilters projects={group.projects} filter={preparation} select={setPreparation} />}
      <Input aria-label="搜索负责项目" prefix={<SearchOutlined />} placeholder="搜索产品、对接人或主要事项"
        allowClear value={search} onChange={(event) => setSearch(event.target.value)} />
      <Typography.Text type="secondary" role="status">共 {filtered.length} 个项目</Typography.Text>
      <Table<DirectorProject> size="small" rowKey={(p) => JSON.stringify([p.brand, p.row])} columns={projectColumns(onProject)} dataSource={filtered}
        scroll={{ x: 640 }} pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} locale={{ emptyText: '没有匹配的新品项目' }} />
    </Flex>
  </Drawer>;
}

export function ProjectDetail({ project, onClose }: { readonly project: DirectorProject; readonly onClose: () => void }) {
  const summary: [string, string][] = [['店铺', project.brand], ['项目对接人', project.contact || '待分配'],
    ['预计入仓时间', project.arrival], ['主要事项', project.notes]];
  const fields = [...summary, ...SCHEDULE_MILESTONES.map((key): [string, string] => [key, project.milestones[key]])];
  return <Drawer open title={project.name} size={`min(${drawerWide}px, 100vw)`} onClose={onClose}>
    <Descriptions column={1} bordered size="small" items={fields.map(([label, value]) => ({
      key: label, label, children: <span style={{ whiteSpace: 'pre-line' }}>{value || '—'}</span>,
    }))} />
  </Drawer>;
}
