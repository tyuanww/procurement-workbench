import { Alert, Button, Card, Empty, Select, Skeleton, Space, Tag, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import type { ProductDevelopment, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS, type ProductDevelopmentStore } from '@sw/domain';
import { workItemStatusLabel } from '../../features/today/index.js';
import { apiErrorMessage } from '../../shared/api/client.js';
import { border, space } from '../../theme/tokens.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import { readDevelopment } from './product-development-api.js';
import { DevelopmentDetail } from './product-development-detail.js';
import { NodeForm, ProjectForm } from './product-development-forms.js';
import { countdownOf, DevelopmentTimeline } from './product-development-timeline.js';
import { storeLabels } from './store-query.js';

type Store = ProductDevelopmentStore | 'all';
type Load = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } |
  { readonly kind: 'ready'; readonly data: ProductDevelopment };

export function ProductDevelopmentPanel({ store }: { readonly store: Store }): ReactNode {
  const { load, reload } = useDevelopment(store);
  if (load.kind === 'loading') return <Skeleton active />;
  if (load.kind === 'error') return <Alert type="error" showIcon title={load.message} action={<Button onClick={reload}>重试</Button>} />;
  return <DevelopmentWorkspace store={store} data={load.data} reload={reload} />;
}

function useDevelopment(store: Store) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readDevelopment(store, controller.signal).then((data) => {
      if (!controller.signal.aborted) setLoad({ kind: 'ready', data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoad({ kind: 'error', message: apiErrorMessage(error) ?? '读取新品进度失败' });
    });
    return () => controller.abort();
  }, [revision, store]);
  return { load, reload: () => setRevision((value) => value + 1) };
}

function DevelopmentWorkspace({ data, store, reload }: { readonly data: ProductDevelopment; readonly store: Store; readonly reload: () => void }): ReactNode {
  const [params, setParams] = useSearchParams();
  const { project, node } = developmentSelection(data.projects, params);
  const show = (projectId: string | null, nodeId: string | null) => setParams((previous) => withSelection(previous, { projectId, nodeId }));
  const saved = (projectId: string | null, nodeId: string | null) => { show(projectId, nodeId); reload(); };
  return <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
    <PendingDevelopment projects={data.projects} onOpen={show} />
    <Space wrap>
      <Select aria-label="新品项目" placeholder="选择新品项目" value={project?.id} style={{ minWidth: 260 }}
        options={data.projects.map((value) => ({ value: value.id, label: `${storeLabels[value.store]} · ${value.title}` }))}
        onChange={(value) => show(value ?? null, null)} />
      {data.canCreateProject ? <DevelopmentEditModal title="新建新品项目" onSaved={(id) => saved(id, null)}>
        {(onSaved) => <ProjectForm users={data.users} store={store} saved={onSaved} />}
      </DevelopmentEditModal> : null}
    </Space>
    {project === undefined ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该店铺暂无新品项目" /> :
      <DevelopmentProjectBody key={project.id} project={project} businessDate={data.businessDate} onOpen={(id) => show(project.id, id)}
        extra={project.canManage ? <DevelopmentEditModal primary title="新增开发节点" onSaved={(id) => saved(project.id, id)}>
          {(onSaved) => <NodeForm project={project} users={data.users} businessDate={data.businessDate} saved={onSaved} />}
        </DevelopmentEditModal> : null} />}
    {node !== undefined && project !== undefined ? <DevelopmentDetail key={node.id} node={node} project={project} users={data.users}
      onClose={() => show(project.id, null)} onChanged={reload} /> : null}
  </Space>;
}

function PendingDevelopment({ projects, onOpen }: {
  readonly projects: ProductDevelopment['projects']; readonly onOpen: (projectId: string, nodeId: string) => void;
}): ReactNode {
  const pending = projects.flatMap((project) => project.nodes.filter((node) => node.canReply).map((node) => ({ node, project })))
    .sort((left, right) => left.node.plannedEnd.localeCompare(right.node.plannedEnd));
  if (pending.length === 0) return null;
  return <Card size="small" title={`采购待跟进（${pending.length}）`}>
    {pending.map(({ node, project }) => <NodeRow key={node.id} node={node} prefix={`${storeLabels[project.store]} · ${project.title}`}
      onOpen={() => onOpen(project.id, node.id)} />)}
  </Card>;
}

function DevelopmentProjectBody({ project, businessDate, onOpen, extra }: {
  readonly project: ProductDevelopmentProject; readonly businessDate: ProductDevelopment['businessDate'];
  readonly onOpen: (nodeId: string) => void; readonly extra: ReactNode;
}): ReactNode {
  const completed = project.nodes.filter((node) => node.status === 'done').length;
  const active = project.nodes.filter((node) => node.status !== 'cancelled').length;
  return <Card title={<Space wrap><span>{project.title}</span><Tag>{storeLabels[project.store]}</Tag></Space>}
    extra={extra}>
    <Space orientation="vertical" style={{ display: 'flex' }} size="large">
      <Space wrap size="large">
        <Typography.Text>主责产品人员 {project.productLeadName ?? '未知'}</Typography.Text>
        <Typography.Text>已完成 {completed} / {active} 个节点</Typography.Text>
      </Space>
      <DevelopmentTimeline project={project} businessDate={businessDate} onOpen={onOpen} />
      {project.nodes.length === 0 ? null : <section aria-label="开发节点列表">
        {project.nodes.map((node) => <NodeRow key={node.id} node={node} onOpen={() => onOpen(node.id)} />)}
      </section>}
    </Space>
  </Card>;
}

function NodeRow({ node, prefix, onOpen }: { readonly node: ProductDevelopmentNode; readonly prefix?: string; readonly onOpen: () => void }): ReactNode {
  return <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space[1], paddingBlock: space[1], borderBottom: `1px solid ${border}` }}>
    <Space orientation="vertical" size={0}>
      <Button type="link" style={{ paddingInline: 0 }} onClick={onOpen}>{node.title}</Button>
      <Typography.Text type="secondary">
        {[prefix, DEVELOPMENT_DESTINATION_LABELS[node.destination], node.ownerName, node.plannedEnd].filter(Boolean).join(' · ')}
      </Typography.Text>
    </Space>
    <Space wrap>
      {node.formalLink === null ? null : <Tag>已关联 OA</Tag>}
      {node.daysUntilRequired === null ? null : <Tag>{workItemStatusLabel(node.status)}</Tag>}
      <Tag>{countdownOf(node)}</Tag>
    </Space>
  </div>;
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
