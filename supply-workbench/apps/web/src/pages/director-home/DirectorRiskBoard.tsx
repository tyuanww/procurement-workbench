import { Button, Card, Col, Descriptions, Drawer, Empty, Flex, Row, Select, Table, Typography, type TableColumnsType } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import { meetingStoreLabels } from '../../features/reporting/index.js';
import { useCan } from '../../shared/actor.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { DELIVERY_RISKS, WAITING_PARTIES, materialName, waitingDetail, type EditDecision, type HomeEdit, type RiskBatch, type RiskType } from './director-home.js';

type Dimension = 'store' | 'supplier' | 'buyer';
const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'store', label: '按店铺' },
  { value: 'supplier', label: '按供应商' },
  { value: 'buyer', label: '按采购负责人' },
];
type Detail = { readonly title: string; readonly rows: readonly RiskBatch[] };

export function DirectorRiskBoard({ risks, onEdit }: { readonly risks: readonly RiskBatch[]; readonly onEdit: EditDecision | undefined }) {
  const [detail, setDetail] = useState<Detail>();
  const overdue = risks.filter((row) => row.risk === 'overdue');
  const selectRisk = (title: string, rows: readonly RiskBatch[]) => setDetail({ title, rows });
  return <Flex vertical gap={space[3]}>
    <MetricStrip ariaLabel="交付风险筛选" items={DELIVERY_RISKS.map(({ key, label, tone }) => {
      const rows = risks.filter((row) => row.risk === key);
      return { key, label, tone, value: rows.length, unit: '批', action: { select: () => selectRisk(label, rows) } };
    })} />
    <Row gutter={[space[3], space[3]]}>
      <Col span={24} style={{ minWidth: 0 }}>
        <RiskTable risks={risks} onSelect={selectRisk} />
      </Col>
      <Col span={24}>
        <Card size="small" title={<Typography.Title level={2} style={{ margin: 0 }}>逾期批次在等谁</Typography.Title>}>
          {overdue.length === 0 ? <Typography.Text type="secondary">当前没有逾期批次。</Typography.Text>
            : <WaitingList overdue={overdue} onSelect={selectRisk} />}
        </Card>
      </Col>
    </Row>
    {detail === undefined ? null : <RiskDrawer {...detail} onClose={() => setDetail(undefined)} onEdit={onEdit} />}
  </Flex>;
}

type RiskGroup = { readonly name: string; readonly rows: readonly RiskBatch[] };

function RiskTable({ risks, onSelect }: {
  readonly risks: readonly RiskBatch[];
  readonly onSelect: (title: string, rows: readonly RiskBatch[]) => void;
}) {
  const [dimension, setDimension] = useState<Dimension>('store');
  const groups = groupedRisks(risks, dimension);
  const columns: TableColumnsType<RiskGroup> = [
    { title: '对象', key: 'name', dataIndex: 'name', rowScope: 'row', width: '34%', onCell: () => ({ style: { overflowWrap: 'anywhere' } }) },
    ...DELIVERY_RISKS.map(({ key, label }) => ({
      title: label, key, render: (_value: unknown, group: RiskGroup) => {
        const rows = group.rows.filter((row) => row.risk === key);
        return rows.length === 0 ? '0' : <Button type="link" size="small"
          aria-label={`${group.name} · ${label} ${rows.length} 批`} onClick={() => onSelect(`${group.name} · ${label}`, rows)}>{rows.length}</Button>;
      },
    })),
  ];
  return <Card size="small" title={<Typography.Title level={2} style={{ margin: 0 }}>交付风险清单</Typography.Title>}>
    <Flex vertical gap={space[2]}>
      <Flex justify="space-between" align="center" wrap gap={space[2]}>
        <Typography.Text type="secondary">周会采购事项中仍在跟进的批次 · 7 天内含今天</Typography.Text>
        <Select<Dimension> aria-label="交付风险分组" options={DIMENSIONS} value={dimension}
          onChange={setDimension} style={{ minWidth: 144 }} />
      </Flex>
      {groups.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所选店铺暂无这些交付风险" />
        : <section aria-label="交付风险按对象汇总">
          <Table size="small" columns={columns} dataSource={groups.map(([name, rows]) => ({ name, rows }))}
            rowKey="name" tableLayout="fixed"
            pagination={groups.length > 8 ? { pageSize: 8, showSizeChanger: false, size: 'small' } : false} />
        </section>}
    </Flex>
  </Card>;
}

function groupedRisks(risks: readonly RiskBatch[], dimension: Dimension) {
  return groupBatches(risks, (row) =>
    dimension === 'store' ? row.meetings.map((meeting) => meetingStoreLabels[meeting.store])
      : [dimension === 'supplier' ? row.material.supplierName ?? '未填供应商' : row.material.buyerName ?? '未分配'],
  ).sort((left, right) => {
    const countOverdue = (items: readonly RiskBatch[]) => items.filter((row) => row.risk === 'overdue').length;
    return countOverdue(right[1]) - countOverdue(left[1]) || right[1].length - left[1].length || left[0].localeCompare(right[0], 'zh-CN');
  });
}

function groupBatches<Key>(rows: readonly RiskBatch[], keys: (row: RiskBatch) => readonly Key[]) {
  const groups = new Map<Key, RiskBatch[]>();
  for (const row of rows) {
    for (const key of keys(row)) {
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [row]);
      else group.push(row);
    }
  }
  return [...groups];
}

function WaitingList({ overdue, onSelect }: {
  readonly overdue: readonly RiskBatch[];
  readonly onSelect: (title: string, rows: readonly RiskBatch[]) => void;
}) {
  const byParty = groupBatches(overdue, (row) => row.waiting);
  return <Flex vertical gap={space[2]}>
    <Typography.Text type="secondary">共 {overdue.length} 批，同一批可能同时等多方。</Typography.Text>
    {byParty.sort((left, right) => right[1].length - left[1].length).map(([party, entries]) =>
      <Button key={party} block onClick={() => onSelect(`${WAITING_PARTIES[party]} · 逾期未到`, entries)}>
        {WAITING_PARTIES[party]} · {entries.length} 批
      </Button>)}
  </Flex>;
}

export function RiskDrawer({ title, rows, onClose, onEdit }: Detail & {
  readonly onClose: () => void;
  readonly onEdit: EditDecision | undefined;
}) {
  const [page, setPage] = useState(1);
  const [isOpen, setOpen] = useState(true);
  const [pendingEdit, setPendingEdit] = useState<HomeEdit>();
  const pageSize = 10;
  const canReadLine = useCan('data.read');
  return <Drawer open={isOpen} title={`${title} · ${rows.length} 批`} onClose={() => setOpen(false)}
    afterOpenChange={(open) => {
      if (open) return;
      onClose();
      if (pendingEdit !== undefined) onEdit?.(pendingEdit.editor, pendingEdit.meeting);
    }}
    size={`min(${drawerWidth}px, 100vw)`} focusable={{ trap: true, focusTriggerAfterClose: true }}>
    {rows.length === 0 ? <Empty description="当前没有这类批次" /> : <Flex vertical gap={space[2]}>
      {rows.slice((page - 1) * pageSize, page * pageSize).map((row) => <RiskDetail key={row.batch.id}
        row={row} canReadLine={canReadLine}
        onEdit={onEdit === undefined ? undefined : (editor, meeting) => {
          setPendingEdit({ editor, meeting });
          setOpen(false);
        }} />)}
      {rows.length <= pageSize ? null : <Flex align="center" justify="space-between" gap={space[2]}>
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button>
        <span role="status">第 {page} / {Math.ceil(rows.length / pageSize)} 页</span>
        <Button disabled={page * pageSize >= rows.length} onClick={() => setPage(page + 1)}>下一页</Button>
      </Flex>}
    </Flex>}
  </Drawer>;
}

function RiskDetail({ row, canReadLine, onEdit }: {
  readonly row: RiskBatch;
  readonly canReadLine: boolean;
  readonly onEdit: EditDecision | undefined;
}) {
  const { batch, material, meetings } = row;
  const [store, setStore] = useState(meetings[0].store);
  const meeting = meetings.find((candidate) => candidate.store === store) ?? meetings[0];
  const label = riskLabel(row.risk);
  return <Card size="small" title={`${materialName(material)} · 第 ${batch.seq} 批`}
    styles={{ title: { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}>
    <Flex vertical gap={space[2]}>
      <Descriptions size="small" column={1} items={[
        { key: 'store', label: '涉及店铺', children: meetings.map(({ store }) => meetingStoreLabels[store]).join('、') },
        { key: 'po', label: '采购单号', children: material.poRef ?? '未填写' },
        { key: 'date', label: '交付状态', children: batch.confirmedArrival === null ? label : `${label} · ${batch.confirmedArrival} 应到` },
        { key: 'waiting', label: '正在等', children: waitingDetail(row) },
        { key: 'buyer', label: '可找谁协调', children: material.buyerName ?? '采购负责人待分配' },
      ]} />
      {row.risk === 'overdue' ? <Typography.Text>请确认还差什么，以及新的预计到货日。</Typography.Text> : null}
      <Flex wrap gap={space[2]} align="center">
        {canReadLine ? <Link to={`/lines/${encodeURIComponent(material.materialLineId)}?focusBatch=${encodeURIComponent(batch.id)}`}>查看批次原记录</Link> : null}
        {onEdit === undefined ? null : <>
          {meetings.length < 2 ? null : <Select aria-label="决定归属店铺" value={store} onChange={setStore}
            options={meetings.map(({ store }) => ({ label: meetingStoreLabels[store], value: store }))} />}
          <Button onClick={() => onEdit({ kind: 'record', material }, meeting)}>记录协调决定</Button>
        </>}
      </Flex>
    </Flex>
  </Card>;
}

function riskLabel(risk: RiskType): string {
  return DELIVERY_RISKS.find(({ key }) => key === risk)?.label ?? risk;
}
