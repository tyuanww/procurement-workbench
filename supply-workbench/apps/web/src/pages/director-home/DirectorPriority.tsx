import { Alert, Button, Card, Collapse, Descriptions, Flex, Tag, Typography } from 'antd';
import type { ManagementDecision } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { meetingStoreLabels } from '../../features/reporting/index.js';
import { brand, space } from '../../theme/tokens.js';
import { materialName, waitingDetail, type EditDecision, type OpenDecision, type RiskBatch } from './director-home.js';
import { RiskDrawer } from './DirectorRiskBoard.js';

export function DirectorPriority({ risks, decisions, today, receipt, onEdit }: {
  readonly risks: readonly RiskBatch[];
  readonly decisions: readonly OpenDecision[];
  readonly today: LocalDate;
  readonly receipt: ManagementDecision | undefined;
  readonly onEdit: EditDecision | undefined;
}) {
  const [coordinating, setCoordinating] = useState<RiskBatch>();
  const [next, ...rest] = decisions;
  const overdue = risks.find((row) => row.risk === 'overdue');
  const canAct = next !== undefined || overdue !== undefined;
  return <Flex vertical gap={space[2]}>
    {receipt === undefined ? null : <Alert type="success" showIcon role="status"
      title={receipt.completion === null ? '已记录决定' : '已登记完成'}
      description={receipt.completion === null
        ? `${receipt.decision} · ${receipt.owner.name}负责 · ${receipt.dueDate} 前完成`
        : `${receipt.decision} · 完成依据 ${receipt.completion.evidence}`} />}
    <Card size="small" style={canAct ? { background: brand[100], borderColor: brand[300] } : {}}>
      <Flex vertical gap={space[2]}>
        {next !== undefined ? <>
          <DecisionAction entry={next} today={today} onEdit={onEdit} />
          {rest.length === 0 ? null : <Collapse size="small" items={[{
            key: 'other', label: `还有 ${rest.length} 条待跟进决定`,
            children: <Flex vertical gap={space[2]}>{rest.map((entry) =>
              <DecisionAction key={entry.decision.id} entry={entry} today={today} onEdit={onEdit} />)}</Flex>,
          }]} />}
        </> : overdue !== undefined ? <CoordinationAction row={overdue} onOpen={() => setCoordinating(overdue)} /> : <>
          <Typography.Title level={2} style={{ margin: 0 }}>暂无需要你优先处理的事项</Typography.Title>
          <Typography.Text type="secondary">下方可查看本周采购交付风险。</Typography.Text>
        </>}
      </Flex>
    </Card>
    {coordinating === undefined ? null : <RiskDrawer title="协调这笔逾期交付" rows={[coordinating]}
      onClose={() => setCoordinating(undefined)} onEdit={onEdit} />}
  </Flex>;
}

function CoordinationAction({ row, onOpen }: { readonly row: RiskBatch; readonly onOpen: () => void }) {
  return <Flex align="center" justify="space-between" gap={space[3]} wrap>
    <Flex vertical gap={space[1]} style={{ minWidth: 0 }}>
      <Typography.Text strong>建议优先协调</Typography.Text>
      <Typography.Title level={2} style={{ margin: 0, overflowWrap: 'anywhere' }}>{materialName(row.material)}逾期未到</Typography.Title>
      <Typography.Text>原定 {row.batch.confirmedArrival} 到货 · {waitingDetail(row)}</Typography.Text>
    </Flex>
    <Button type="primary" onClick={onOpen}>查看协调信息</Button>
  </Flex>;
}

function DecisionAction({ entry, today, onEdit }: {
  readonly entry: OpenDecision;
  readonly today: LocalDate;
  readonly onEdit: EditDecision | undefined;
}) {
  const { decision, meeting } = entry;
  const query = new URLSearchParams({ view: 'meeting', store: meeting.store, weekStart: meeting.weekStart });
  return <Flex align="center" justify="space-between" gap={space[3]} wrap>
    <Flex vertical gap={space[1]} style={{ minWidth: 0 }}>
      <Flex gap={space[1]} wrap align="center">
        <Typography.Text strong>待跟进决定</Typography.Text>
        {decision.dueDate < today ? <Tag color="error">已过截止日</Tag>
          : decision.dueDate === today ? <Tag color="warning">今天到期</Tag> : null}
      </Flex>
      <Typography.Title level={2} style={{ margin: 0, overflowWrap: 'anywhere' }}>{decision.decision}</Typography.Title>
      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} items={[
        { key: 'store', label: '店铺', children: meetingStoreLabels[meeting.store] },
        { key: 'owner', label: '负责人', children: decision.owner.name },
        { key: 'due', label: '截止日', children: decision.dueDate },
        { key: 'criteria', label: '完成标准', children: decision.completionCriteria, span: 'filled' },
      ]} />
    </Flex>
    {onEdit === undefined ? <Link to={`/dashboard?${query}`}>查看管理周会</Link>
      : <Button type="primary" onClick={() => onEdit({ kind: 'complete', decision }, meeting)}>登记决定完成</Button>}
  </Flex>;
}
