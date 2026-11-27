import { Card, Descriptions, Drawer, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import type { ProductDevelopment, ProductDevelopmentBatch, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { batchStatusLabel, DEVELOPMENT_DESTINATION_LABELS, type LocalDate } from '@sw/domain';
import { TaskTagView, WorkItemStatusTag } from '../../features/plan/index.js';
import { drawerWide, space } from '../../theme/tokens.js';
import { ScheduleOrderLink } from './procurement-schedule-panel.js';
import { DevelopmentEditModal } from './development-edit-modal.js';
import { NodePlanForm, ReplyForm } from './product-development-forms.js';
import { DevelopmentCoordinationTag, DevelopmentFollowUpFacts, DevelopmentNodeFollowUpForm } from './product-development-progress.js';
import { DevelopmentLinkForm } from './product-development-link.js';
import { DevelopmentNodeEventTimeline } from './product-development-events.js';
import { hasVerifiedBatchReceipt } from './product-development-forecast.js';
import { coordinationReasons, developmentNodeCoordination, developmentNodeOwnerName } from './product-development-workflow.js';
import './product-development-detail.css';

export function DevelopmentDetail({ node, project, users, today, onClose, onChanged, selectedBatch }: {
  readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject; readonly users: ProductDevelopment['users'];
  readonly today: LocalDate;
  readonly onClose: () => void; readonly onChanged: () => void; readonly selectedBatch: string | null;
}): ReactNode {
  return <Drawer title={<div className="development-detail-heading">
    <span>{node.title}</span>
    <Typography.Text type="secondary">{project.title} · {DEVELOPMENT_DESTINATION_LABELS[node.destination]}</Typography.Text>
  </div>} size={`min(${drawerWide}px, 100vw)`} open onClose={onClose} className="development-detail"
    focusable={{ trap: true, focusTriggerAfterClose: true }}>
    <div className="development-detail-body">
      <NodeOverview node={node} project={project} today={today} />
      <DetailActions node={node} project={project} users={users} onChanged={onChanged} />
      <DevelopmentNodeEventTimeline node={node} />
      {node.formalLink === null ? null : <LinkedFulfillment node={node} store={project.store} selectedBatch={selectedBatch} />}
    </div>
  </Drawer>;
}

function DetailActions({ node, project, users, onChanged }: {
  readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject;
  readonly users: ProductDevelopment['users']; readonly onChanged: () => void;
}): ReactNode {
  if (!node.canReply && !project.canManage) return null;
  return <Space className="development-detail-actions" wrap>
    {node.canReply ? <DevelopmentEditModal primary title="记录采购回复" onSaved={onChanged}>
      {(saved) => <ReplyForm node={node} saved={saved} />}
    </DevelopmentEditModal> : null}
    {project.canManage ? <>
      <DevelopmentEditModal key={`follow-up:${node.version}`} primary={!node.canReply} title="更新跟进" onSaved={onChanged}>
        {(saved) => <DevelopmentNodeFollowUpForm node={node} saved={saved} />}
      </DevelopmentEditModal>
      <DevelopmentEditModal key={`plan:${node.version}`} title="编辑节点计划" onSaved={onChanged}>
        {(saved) => <NodePlanForm users={users} node={node} saved={saved} />}
      </DevelopmentEditModal>
    </> : null}
    {project.canManage && node.destination !== 'other' && node.formalLink === null ?
      <DevelopmentEditModal title="关联正式订单" onSaved={onChanged}>
        {(saved) => <DevelopmentLinkForm node={node} store={project.store} saved={saved} />}
      </DevelopmentEditModal> : null}
  </Space>;
}

function NodeOverview({ node, project, today }: {
  readonly node: ProductDevelopmentNode; readonly project: ProductDevelopmentProject; readonly today: LocalDate;
}): ReactNode {
  const item = developmentNodeCoordination({ node, today });
  const risk = item === null ? [] : coordinationReasons(item).filter((reason) => node.status !== 'blocked' || reason !== '风险原因 已阻塞');
  return <Card size="small" variant="borderless" className="development-detail-summary">
    <div className="development-detail-summary-heading">
      <Typography.Title level={3}>当前跟进</Typography.Title>
      <div className="development-detail-status">
        <WorkItemStatusTag status={node.status} />
        {item === null ? null : <DevelopmentCoordinationTag item={item} />}
      </div>
    </div>
    {risk.length === 0 ? null : <Typography.Text className="development-detail-risk">{risk.join(' · ')}</Typography.Text>}
    <div className="development-detail-deadline">
      <span>项目要求日 <time dateTime={node.plannedEnd}>{node.plannedEnd}</time></span>
      {node.daysUntilRequired === null ? null : <Typography.Text type="secondary">{countdownOf(node.daysUntilRequired)}</Typography.Text>}
    </div>
    <div className="development-detail-facts">
      <DevelopmentFollowUpFacts followUp={node.followUp} colon={false} />
      <Descriptions size="small" column={1} colon={false} className="development-project-facts" items={[
        { key: 'owner', label: '节点负责人', children: developmentNodeOwnerName(node) },
        { key: 'lead', label: '项目对接人', children: project.productLeadName ?? '待核对' },
        { key: 'buyer', label: '跟进采购', children: node.buyerName ?? '未分派' },
      ]} />
    </div>
  </Card>;
}

function LinkedFulfillment({ node, store, selectedBatch }: { readonly node: ProductDevelopmentNode; readonly store: ProductDevelopmentProject['store']; readonly selectedBatch: string | null }): ReactNode {
  const formal = node.formalLink;
  if (formal === null) return null;
  return <Card title="正式订单履约" size="small">
    <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
      <Space wrap>
        <ScheduleOrderLink order={{ lineId: formal.orderLineId, ...(selectedBatch !== null && formal.procurementLineId === formal.orderLineId ? { batchId: selectedBatch } : {}) }}
          store={store} focusKey="development-oa">OA {formal.oaRef}</ScheduleOrderLink>
        {formal.procurementLineId === formal.orderLineId ? null :
          <ScheduleOrderLink order={{ lineId: formal.procurementLineId, ...(selectedBatch === null ? {} : { batchId: selectedBatch }) }} store={store} focusKey="development-material">打开子件采购事项</ScheduleOrderLink>}
      </Space>
      <Typography.Text type="secondary">后续承诺、发货和收货在正式采购事项中登记。</Typography.Text>
      {node.batches.length === 0 ? <Typography.Text type="secondary">当前无正式要货批次</Typography.Text> :
        node.batches.map((batch) => <BatchFacts key={batch.id} batch={batch} isSelected={batch.id === selectedBatch} />)}
    </Space>
  </Card>;
}

function BatchFacts({ batch, isSelected }: { readonly batch: ProductDevelopmentBatch; readonly isSelected: boolean }): ReactNode {
  const shown = batch.fulfillment;
  const qty = (value: number | null) => value === null ? '待核实' : `${value} ${shown.unit ?? ''}`.trim();
  const isReceiptVerified = hasVerifiedBatchReceipt(batch);
  const status = batch.status === 'received' ? <TaskTagView tag={isReceiptVerified
    ? { key: 'receipt', label: '收货已核实', tone: 'success', fill: 'solid' }
    : { key: 'receipt', label: '收货待核对', tone: 'warning', fill: 'solid' }} />
    : batch.status === undefined ? null : <Tag>{batchStatusLabel(batch.status)}</Tag>;
  return <Space orientation="vertical" style={{ display: 'flex', paddingBlock: space[1] }}>
    <Typography.Text strong>要货批次 #{batch.seq} {status}
      {isSelected ? <Tag>所选批次</Tag> : null}</Typography.Text>
    {batch.supplierPromisedOn === null || batch.buyerConfirmedOn === null
      ? <Typography.Text type="secondary">{[
        batch.supplierPromisedOn === null ? '供应商承诺未登记' : null,
        batch.buyerConfirmedOn === null ? '采购到货日未确认' : null,
      ].filter(Boolean).join(' · ')}</Typography.Text> : null}
    <Typography.Text>核实实发 {qty(shown.verifiedShippedQty)} · 确认实收 {qty(shown.receivedQty)}
      {batch.plannedQty === undefined ? null : ` · 计划 ${qty(batch.plannedQty)}`}</Typography.Text>
    {batch.reportedShipments.map((row, index) => <Typography.Text key={`${row.reportedOn}:${index}`} type="secondary">
      报发待核 {row.reportedOn} · {row.quantity} {row.unit ?? ''} · {row.evidence}
    </Typography.Text>)}
  </Space>;
}

function countdownOf(days: number): string {
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今日到期';
  return `距要求日期 ${days} 天`;
}
