import { Button, Card, Flex, Select, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { ProductDevelopment, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { space } from '../../theme/tokens.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import { DevelopmentDetail } from './product-development-detail.js';
import { developmentRiskOf, needsDevelopmentReply, nodeWaitingText } from './product-development-forecast.js';
import { NodeForm, ProjectForm } from './product-development-forms.js';
import type { DevelopmentStore } from './planning-load.js';
import type { PlanningSource } from './planning-rows.js';
import { storeLabels } from './store-query.js';

type Actions = {
  readonly data: ProductDevelopment;
  readonly project: ProductDevelopmentProject | undefined;
  readonly params: URLSearchParams;
  readonly reload: () => void;
  readonly onClose: () => void;
  readonly open: (source: PlanningSource, triggerId: string) => void;
  readonly isScopeVisible: boolean;
  readonly visibleNodes: ReadonlySet<string>;
};

export function DevelopmentActions(props: Actions): ReactNode {
  const { data, project, params, reload, onClose, isScopeVisible } = props;
  const node = project?.nodes.find((entry) => entry.id === params.get('developmentNode'));
  return <>
    {isScopeVisible ? <OutsideWindowReplies {...props} /> : null}
    {node === undefined || project === undefined ? null : <DevelopmentDetail key={node.id} node={node} project={project} users={data.users} today={data.businessDate}
      onClose={onClose} onChanged={reload} selectedBatch={params.get('scheduleBatch')} />}
  </>;
}

type Management = Omit<Actions, 'onClose' | 'isScopeVisible'> & {
  readonly store: DevelopmentStore;
  readonly update: (params: URLSearchParams) => void;
  readonly showPriority: boolean;
};

export function DevelopmentManagement(props: Management): ReactNode {
  const { data, store, project, params, update, reload } = props;
  if (project === undefined && !data.canCreateProject) return null;
  const select = ({ projectId, nodeId }: { readonly projectId: string; readonly nodeId?: string }) => {
    const next = new URLSearchParams(params);
    next.set('developmentProject', projectId);
    if (nodeId === undefined) next.delete('developmentNode');
    else next.set('developmentNode', nodeId);
    update(next);
  };
  const saved = ({ projectId, nodeId }: Parameters<typeof select>[0]) => { select({ projectId, ...(nodeId === undefined ? {} : { nodeId }) }); reload(); };
  return <Card size="small" title="新品项目" role="region" aria-label="新品项目"
    className="development-project-card" data-priority={props.showPriority}
    classNames={{ header: 'development-project-header', body: 'development-project-body' }}>
    <Flex className="development-project-controls" wrap gap={space[1]} align="center">
      <DevelopmentProjectPicker projects={data.projects} value={project?.id} onChange={(id) => select({ projectId: id })} />
      {data.canCreateProject ? <DevelopmentEditModal primary title="新建新品项目" onSaved={(id) => saved({ projectId: id })}>
        {(onSaved) => <ProjectForm users={data.users} store={store} saved={onSaved} />}
      </DevelopmentEditModal> : null}
      {project?.canManage ? <DevelopmentEditModal title="新增开发节点" onSaved={(id) => saved({ projectId: project.id, nodeId: id })}>
        {(onSaved) => <NodeForm project={project} users={data.users} businessDate={data.businessDate} saved={onSaved} />}
      </DevelopmentEditModal> : null}
      {project === undefined ? null : <Typography.Text type="secondary">主责产品人员 {project.productLeadName ?? '未知'}</Typography.Text>}
    </Flex>
    <ProjectPriority project={props.showPriority ? project : undefined} visibleNodes={props.visibleNodes} open={props.open} />
  </Card>;
}

function DevelopmentProjectPicker({ projects, value, onChange }: {
  readonly projects: ProductDevelopment['projects']; readonly value: string | undefined; readonly onChange: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return <Select aria-label="新品项目" placeholder="选择新品项目" value={value}
    style={{ width: 260, maxWidth: '100%' }} showSearch={{ optionFilterProp: 'label' }}
    options={projects.map((entry) => ({ value: entry.id, label: `${storeLabels[entry.store]} · ${entry.title}` }))}
    onChange={(id) => { if (id !== undefined) onChange(id); }} />;
}

function ProjectPriority({ project, visibleNodes, open }: Pick<Actions, 'visibleNodes' | 'open' | 'project'>) {
  if (project === undefined) return null;
  const next = project.nodes.filter((node) => visibleNodes.has(node.id) && node.daysUntilRequired !== null)
    .map((node) => ({ node, risk: developmentRiskOf(node) }))
    .sort((left, right) => Number(needsDevelopmentReply(right.node)) - Number(needsDevelopmentReply(left.node))
      || Number(right.risk !== null) - Number(left.risk !== null)
      || left.node.plannedEnd.localeCompare(right.node.plannedEnd))[0];
  if (next === undefined) return null;
  const { node, risk } = next;
  const triggerId = `planning-priority:${node.id}`;
  const waiting = nodeWaitingText(node);
  return <Flex className="development-project-priority" wrap align="center">
    <Typography.Text strong>优先查看</Typography.Text>
    <Button id={triggerId} type="link" aria-haspopup="dialog" onClick={() => open({ kind: 'development', project, node }, triggerId)}>{node.title}</Button>
    <Typography.Text type="secondary">{[waiting, risk, `项目要求 ${node.plannedEnd}`].filter(Boolean).join(' · ')}</Typography.Text>
  </Flex>;
}

function OutsideWindowReplies({ data, visibleNodes, open }: Actions) {
  const pending = data.projects.flatMap((project) => project.nodes.flatMap((node): PendingNode[] =>
    needsDevelopmentReply(node) && !visibleNodes.has(node.id) ? [{ project, node }] : []))
    .sort((left, right) => left.node.plannedEnd.localeCompare(right.node.plannedEnd));
  if (pending.length === 0) return null;
  return <Card size="small" title={`采购待跟进（${pending.length}）`}>
    <Typography.Text type="secondary">当前排期结果之外待我回复的节点</Typography.Text>
    <Flex vertical align="start" gap={space[0]}>
      {pending.map(({ project, node }) => {
        const id = `planning-pending:${node.id}`;
        return <Flex key={node.id} wrap align="center" gap={space[1]}>
          <Button id={id} type="link" onClick={() => open({ kind: 'development', project, node }, id)}>{node.title}</Button>
          <Typography.Text type="secondary">{project.title} · 项目要求 {node.plannedEnd}</Typography.Text>
        </Flex>;
      })}
    </Flex>
  </Card>;
}

type PendingNode = { readonly project: ProductDevelopmentProject; readonly node: ProductDevelopmentNode };
