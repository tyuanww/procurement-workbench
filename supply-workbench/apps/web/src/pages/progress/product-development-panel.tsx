import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Alert, Button, Card, Empty, Flex, Select, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { ProductDevelopment, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS, type ProductDevelopmentStore } from '@sw/domain';
import { workItemStatusLabel } from '../../features/today/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import { readDevelopment } from './product-development-api.js';
import { DevelopmentDetail } from './product-development-detail.js';
import { developmentForecast } from './product-development-forecast.js';
import { NodeForm, ProjectForm } from './product-development-forms.js';
import { countdownOf, DevelopmentTimeline } from './product-development-timeline.js';
import { storeLabels } from './store-query.js';

type Store = ProductDevelopmentStore | 'all';
type Load = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } |
  { readonly kind: 'ready'; readonly data: ProductDevelopment };

export function ProductDevelopmentPanel({ store, filters }: { readonly store: Store; readonly filters: ReactNode }): ReactNode {
  const { load, reload } = useDevelopment(store);
  const [params, setParams] = useSearchParams();
  const data = load.kind === 'ready' ? load.data : null;
  const selection = developmentSelection(data?.projects ?? [], params);
  const show = (projectId: string | null, nodeId: string | null) => setParams((previous) => withSelection(previous, { projectId, nodeId }));
  const saved = (projectId: string, nodeId: string | null) => { show(projectId, nodeId); reload(); };
  return <Flex vertical gap={space[3]}>
    <Card size="small"><Flex wrap align="center" gap={space[2]}>
      {filters}
      {data === null ? null : <DevelopmentProjectControls data={data} store={store} projectId={selection.project?.id}
        onSelect={(id) => show(id, null)} onSaved={(id) => saved(id, null)} />}
      <ProcurementCutoff />
    </Flex></Card>
    {load.kind === 'loading' ? <Skeleton active /> : null}
    {load.kind === 'error' ? <Alert type="error" showIcon title={load.message} action={<Button onClick={reload}>重试</Button>} /> : null}
    {data === null ? null : <DevelopmentWorkspace data={data} {...selection} show={show} saved={saved} reload={reload} />}
  </Flex>;
}

function useDevelopment(store: Store) {
  const [result, setResult] = useState<{ readonly store: Store; readonly load: Load }>({ store, load: { kind: 'loading' } });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readDevelopment(store, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ store, load: { kind: 'ready', data } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ store, load: { kind: 'error', message: apiErrorMessage(error) ?? '读取新品进度失败' } });
    });
    return () => controller.abort();
  }, [revision, store]);
  const load: Load = result.store === store ? result.load : { kind: 'loading' };
  return { load, reload: () => setRevision((value) => value + 1) };
}

function DevelopmentProjectControls({ data, store, projectId, onSelect, onSaved }: {
  readonly data: ProductDevelopment;
  readonly store: Store;
  readonly projectId: string | undefined;
  readonly onSelect: (id: string | null) => void;
  readonly onSaved: (id: string) => void;
}) {
  return <>
    <Select aria-label="新品项目" placeholder="选择新品项目" value={projectId} style={{ width: 260, maxWidth: '100%' }}
      showSearch={{ optionFilterProp: 'label' }}
      options={data.projects.map((value) => ({ value: value.id, label: `${storeLabels[value.store]} · ${value.title}` }))}
      onChange={(value) => onSelect(value ?? null)} />
    {data.canCreateProject ? <DevelopmentEditModal primary title="新建新品项目" onSaved={onSaved}>
      {(saved) => <ProjectForm users={data.users} store={store} saved={saved} />}
    </DevelopmentEditModal> : null}
  </>;
}

function DevelopmentWorkspace({ data, project, node, show, saved, reload }: {
  readonly data: ProductDevelopment;
  readonly project: ProductDevelopmentProject | undefined;
  readonly node: ProductDevelopmentNode | undefined;
  readonly show: (projectId: string | null, nodeId: string | null) => void;
  readonly saved: (projectId: string, nodeId: string | null) => void;
  readonly reload: () => void;
}): ReactNode {
  return <>
    {project === undefined ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该店铺暂无新品项目" /> :
      <DevelopmentProjectBody key={project.id} project={project} businessDate={data.businessDate} onOpen={(id) => show(project.id, id)}
        extra={project.canManage ? <DevelopmentEditModal primary title="新增开发节点" onSaved={(id) => saved(project.id, id)}>
          {(onSaved) => <NodeForm project={project} users={data.users} businessDate={data.businessDate} saved={onSaved} />}
        </DevelopmentEditModal> : null} />}
    <PendingDevelopment projects={data.projects} onOpen={show} />
    {node !== undefined && project !== undefined ? <DevelopmentDetail key={node.id} node={node} project={project} users={data.users}
      onClose={() => show(project.id, null)} onChanged={reload} /> : null}
  </>;
}

function PendingDevelopment({ projects, onOpen }: {
  readonly projects: ProductDevelopment['projects']; readonly onOpen: (projectId: string, nodeId: string) => void;
}): ReactNode {
  const pending = projects.flatMap((project) => project.nodes.filter((node) => node.canReply).map((node) => ({ node, project })))
    .sort((left, right) => left.node.plannedEnd.localeCompare(right.node.plannedEnd));
  if (pending.length === 0) return null;
  return <Card size="small" title={`采购待跟进（${pending.length}）`}>
    <DevelopmentNodes rows={pending} showProject onOpen={onOpen} />
  </Card>;
}

function DevelopmentProjectBody({ project, businessDate, onOpen, extra }: {
  readonly project: ProductDevelopmentProject; readonly businessDate: ProductDevelopment['businessDate'];
  readonly onOpen: (nodeId: string) => void; readonly extra: ReactNode;
}): ReactNode {
  const completed = project.nodes.filter((node) => node.status === 'done').length;
  const active = project.nodes.filter((node) => node.status !== 'cancelled').length;
  const next = project.nodes
    .filter((node) => node.status !== 'done' && node.status !== 'cancelled')
    .sort((left, right) => left.plannedEnd.localeCompare(right.plannedEnd))[0];
  return <Card title={<Space wrap><span>{project.title}</span><Tag>{storeLabels[project.store]}</Tag></Space>}
    styles={{ title: { whiteSpace: 'normal', overflowWrap: 'anywhere', paddingInlineEnd: space[1] } }}
    extra={extra}>
    <Flex vertical gap={space[3]}>
      <Space wrap size="large">
        <Typography.Text>主责产品人员 {project.productLeadName ?? '未知'}</Typography.Text>
        <Typography.Text>已完成 {completed} / {active} 个节点</Typography.Text>
      </Space>
      {next === undefined ? null : <Flex wrap align="center" gap={space[1]}>
        <Typography.Text strong>最早待完成节点</Typography.Text>
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => onOpen(next.id)}>{next.title}</Button>
        <Typography.Text type="secondary">{next.plannedEnd}</Typography.Text>
        <ForecastTag node={next} />
      </Flex>}
      <DevelopmentTimeline project={project} businessDate={businessDate} onOpen={onOpen} />
      {project.nodes.length === 0 ? null : <section aria-label="开发节点列表">
        <DevelopmentNodes rows={project.nodes.map((node) => ({ node, project }))} onOpen={(_projectId, nodeId) => onOpen(nodeId)} />
      </section>}
    </Flex>
  </Card>;
}

type DevelopmentNodeRow = { readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject };

function DevelopmentNodes({ rows, showProject, onOpen }: {
  readonly rows: readonly DevelopmentNodeRow[];
  readonly showProject?: boolean;
  readonly onOpen: (projectId: string, nodeId: string) => void;
}) {
  return <Table<DevelopmentNodeRow> size="small" rowKey={({ node }) => node.id} dataSource={rows}
    pagination={{ defaultPageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} columns={[
      { title: '开发节点', rowScope: 'row', render: (_, { node, project }) => (
        <Flex vertical style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Button type="link" style={{ paddingInline: 0, height: 'auto', minHeight: 32, whiteSpace: 'normal', textAlign: 'start', alignSelf: 'start' }}
            onClick={() => onOpen(project.id, node.id)}>{node.title}</Button>
          {showProject ? <Typography.Text type="secondary">{storeLabels[project.store]} · {project.title}</Typography.Text> : null}
          <Typography.Text type="secondary">{DEVELOPMENT_DESTINATION_LABELS[node.destination]} · {node.ownerName ?? '未分配'}</Typography.Text>
        </Flex>
      ) },
      { title: '交期与状态', render: (_, { node }) => (
        <Flex vertical gap={space[0]}>
          <Typography.Text>项目要求 {node.plannedEnd}</Typography.Text>
          <Typography.Text type="secondary">
            {node.formalLink === null ? '供应商承诺' : '新品阶段承诺'} {node.latestReply?.promisedOn ?? '暂无回复'}
          </Typography.Text>
          <Flex wrap gap={space[0]}>
            <ForecastTag node={node} />
            {node.formalLink === null ? null : <Tag>已关联 OA</Tag>}
            {node.daysUntilRequired === null ? null : <Tag>{workItemStatusLabel(node.status)}</Tag>}
            <Tag>{countdownOf(node)}</Tag>
          </Flex>
        </Flex>
      ) },
    ]} />;
}

function ForecastTag({ node }: { readonly node: ProductDevelopmentNode }): ReactNode {
  const forecast = developmentForecast(node);
  switch (forecast.kind) {
    case 'inactive': return null;
    case 'unknown': return <Tag>交期待确认</Tag>;
    case 'on-time': return <Tag>承诺未晚于要求</Tag>;
    case 'late': return <StatusTag status="demand_before_confirmed" label={`预计晚 ${forecast.days} 天`} />;
  }
}

function withSelection(previous: URLSearchParams, { projectId, nodeId }: { readonly projectId: string | null; readonly nodeId: string | null }) {
  const next = new URLSearchParams(previous);
  if (projectId === null) next.delete('developmentProject');
  else next.set('developmentProject', projectId);
  if (nodeId === null) next.delete('developmentNode');
  else next.set('developmentNode', nodeId);
  return next;
}

function developmentSelection(projects: ProductDevelopment['projects'], params: URLSearchParams) {
  const project = projects.find((value) => value.id === params.get('developmentProject')) ?? projects[0];
  const node = project?.nodes.find((value) => value.id === params.get('developmentNode'));
  return { project, node };
}
