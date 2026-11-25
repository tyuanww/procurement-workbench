import { Card, Descriptions, Drawer, Empty, Space, Tag, Timeline, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ProductDevelopment, ProductDevelopmentBatch, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS } from '@sw/domain';
import { workItemStatusLabel } from '../../features/today/index.js';
import { drawerWide, space } from '../../theme/tokens.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import { NodePlanForm, ReplyForm } from './product-development-forms.js';
import { DevelopmentLinkForm } from './product-development-link.js';
import { countdownOf } from './product-development-timeline.js';

export function DevelopmentDetail({ node, project, users, onClose, onChanged }: {
  readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject; readonly users: ProductDevelopment['users'];
  readonly onClose: () => void; readonly onChanged: () => void;
}): ReactNode {
  return <Drawer title={node.title} size={`min(${drawerWide}px, 100vw)`} open onClose={onClose}
    focusable={{ trap: true, focusTriggerAfterClose: true }}
    extra={<DetailActions node={node} project={project} users={users} onChanged={onChanged} />}>
    <Space orientation="vertical" size="large" style={{ display: 'flex' }}>
      <NodeOverview node={node} />
      <ReplyHistory node={node} />
      {node.formalLink === null ? null : <LinkedFulfillment node={node} store={project.store} />}
    </Space>
  </Drawer>;
}

function DetailActions({ node, project, users, onChanged }: {
  readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject;
  readonly users: ProductDevelopment['users']; readonly onChanged: () => void;
}): ReactNode {
  return <Space wrap>
    {node.canReply ? <DevelopmentEditModal primary title="记录采购回复" onSaved={onChanged}>
      {(saved) => <ReplyForm node={node} saved={saved} />}
    </DevelopmentEditModal> : null}
    {project.canManage ? <DevelopmentEditModal key={node.version} title="编辑节点计划" onSaved={onChanged}>
      {(saved) => <NodePlanForm users={users} node={node} saved={saved} />}
    </DevelopmentEditModal> : null}
    {project.canManage && node.destination !== 'other' && node.formalLink === null ?
      <DevelopmentEditModal title="关联正式订单" onSaved={onChanged}>
        {(saved) => <DevelopmentLinkForm node={node} store={project.store} saved={saved} />}
      </DevelopmentEditModal> : null}
  </Space>;
}

function NodeOverview({ node }: { readonly node: ProductDevelopmentNode }): ReactNode {
  return <Space orientation="vertical" style={{ display: 'flex' }}>
    <Space wrap>
      <Tag>{DEVELOPMENT_DESTINATION_LABELS[node.destination]}</Tag>
      <Tag>{workItemStatusLabel(node.status)}</Tag>
      {node.daysUntilRequired === null ? null : <Tag>{countdownOf(node)}</Tag>}
    </Space>
    <Descriptions size="small" column={1} items={[
      { key: 'owner', label: '节点负责人', children: node.ownerName ?? '未分配' },
      { key: 'buyer', label: '跟进采购', children: node.buyerName ?? '未分派' },
      { key: 'start', label: '计划开始', children: node.plannedStart },
    ]} />
    <Typography.Text strong>项目要求 {node.plannedEnd}</Typography.Text>
    <Typography.Text strong>供应商承诺 {node.latestReply?.promisedOn ?? '暂无新品阶段回复'}</Typography.Text>
  </Space>;
}

function ReplyHistory({ node }: { readonly node: ProductDevelopmentNode }): ReactNode {
  return <Card title="新品阶段采购回复" size="small">
    {node.replies.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无采购回复" /> :
      <Timeline items={node.replies.map((reply) => ({
        key: reply.id,
        content: <>
          <Typography.Text strong>{reply.promisedOn}</Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{reply.evidence}</Typography.Paragraph>
          <Typography.Text type="secondary">{reply.actorName ?? '采购账号'} · {reply.recordedAt.slice(0, 10)}</Typography.Text>
        </>,
      }))} />}
  </Card>;
}

function LinkedFulfillment({ node, store }: { readonly node: ProductDevelopmentNode; readonly store: string }): ReactNode {
  const formal = node.formalLink;
  if (formal === null) return null;
  const lineHref = (id: string) => `/lines/${encodeURIComponent(id)}?store=${store}`;
  return <Card title="正式订单履约" size="small">
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      <Space wrap>
        <Link to={lineHref(formal.orderLineId)}>OA {formal.oaRef}</Link>
        {formal.procurementLineId === formal.orderLineId ? null :
          <Link to={lineHref(formal.procurementLineId)}>打开子件采购事项</Link>}
      </Space>
      <Typography.Text type="secondary">后续承诺、发货和收货在正式采购事项中登记。</Typography.Text>
      {node.batches.length === 0 ? <Typography.Text type="secondary">当前无正式要货批次</Typography.Text> :
        node.batches.map((batch) => <BatchFacts key={batch.id} batch={batch} />)}
    </Space>
  </Card>;
}

function BatchFacts({ batch }: { readonly batch: ProductDevelopmentBatch }): ReactNode {
  const shown = batch.fulfillment;
  const qty = (value: number | null) => value === null ? '待核实' : `${value} ${shown.unit ?? ''}`.trim();
  return <Space orientation="vertical" style={{ display: 'flex', paddingBlock: space[1] }}>
    <Typography.Text strong>要货批次 #{batch.seq}</Typography.Text>
    <Typography.Text>供应商承诺 {batch.supplierPromisedOn ?? '未登记'} · 采购确认 {batch.buyerConfirmedOn ?? '未确认'}</Typography.Text>
    <Typography.Text>核实实发 {qty(shown.verifiedShippedQty)} · 确认实收 {qty(shown.receivedQty)}</Typography.Text>
    {batch.reportedShipments.map((row, index) => <Typography.Text key={`${row.reportedOn}:${index}`} type="secondary">
      报发待核 {row.reportedOn} · {row.quantity} {row.unit ?? ''} · {row.evidence}
    </Typography.Text>)}
  </Space>;
}
