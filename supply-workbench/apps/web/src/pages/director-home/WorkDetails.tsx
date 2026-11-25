import { Button, Card, Descriptions, Drawer, Flex, Input, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { lineStageLabel } from '@sw/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { drawerWidth, space } from '../../theme/tokens.js';
import { dateOf, inView, matchesSearch, SIGNALS, VIEWS, type OwnerLoad, type Signal, type View, type WorkRow } from './work-register.js';

export type WorkFilter = { view: View; owner: string | undefined; signal: Signal | undefined; search: string };
export const initialFilter: WorkFilter = { view: 'watch', owner: undefined, signal: undefined, search: '' };

function signalColor(signal: Signal) {
  if (signal === 'overdue') return 'error';
  if (signal === 'late' || signal === 'exception') return 'warning';
  return signal === 'soon' ? 'processing' : 'default';
}

function Signals({ row }: { readonly row: WorkRow }) {
  if (row.signals.length === 0) return <Typography.Text type="secondary">按计划跟进</Typography.Text>;
  return <Flex gap={space[0]} wrap>{row.signals.map((signal) =>
    <Tag key={signal} color={signalColor(signal)}>{SIGNALS[signal]}</Tag>)}</Flex>;
}

function productName(row: WorkRow) {
  return row.line.nameRaw ?? row.line.itemCodeRaw ?? '品名待补';
}

function columns(open: (row: WorkRow) => void): TableColumnsType<WorkRow> {
  return [
    { title: '产品 / 物料', key: 'product', rowScope: 'row', sorter: (a, b) => productName(a).localeCompare(productName(b), 'zh-CN'),
      render: (_, row) => <Flex vertical align="start" gap={space[0]}>
        <Button type="link" onClick={() => open(row)} style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }}>{productName(row)}</Button>
        <Typography.Text type="secondary">{row.line.lane === 'finished' ? '成品' : '物料'} · {row.line.po.poRaw ?? '无单号'}</Typography.Text>
      </Flex> },
    { title: '关注原因', key: 'signals', render: (_, row) => <Signals row={row} /> },
    { title: '采购负责人', key: 'owner', sorter: (a, b) => (a.line.buyer?.name ?? '').localeCompare(b.line.buyer?.name ?? '', 'zh-CN'),
      render: (_, row) => row.line.buyer?.name ?? '待分配' },
    { title: '下一到货日', key: 'date', sorter: (a, b) => dateOf(a).localeCompare(dateOf(b)),
      render: (_, row) => row.line.nextDue?.dateBuyerConfirmed ?? (row.line.stage === 'no_batch' ? '尚未建批' : '待确认') },
  ];
}

export function WorkDetails({ rows, owners, filter, onFilter }: {
  readonly rows: readonly WorkRow[]; readonly owners: readonly OwnerLoad[]; readonly filter: WorkFilter;
  readonly onFilter: (filter: WorkFilter) => void;
}) {
  const [selected, setSelected] = useState<WorkRow>();
  const filtered = rows.filter((row) => inView(row, filter.view) && (filter.owner === undefined || row.ownerId === filter.owner)
    && (filter.signal === undefined || row.signals.includes(filter.signal)) && matchesSearch(row, filter.search));
  return <section aria-label="事项跟踪明细"><Card title="事项跟踪明细" extra={<Typography.Text type="secondary" role="status">{filtered.length} 件</Typography.Text>}>
    <Flex vertical gap={space[3]}>
      <WorkFilters owners={owners} filter={filter} onFilter={onFilter} />
      <Table<WorkRow> size="small" rowKey={(row) => row.line.id} columns={columns(setSelected)} dataSource={filtered}
        scroll={{ x: 520 }} pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
        locale={{ emptyText: '当前条件没有匹配事项' }} />
    </Flex>
    {selected === undefined ? null : <WorkDrawer row={selected} onClose={() => setSelected(undefined)} />}
  </Card></section>;
}

function WorkFilters({ owners, filter, onFilter }: {
  readonly owners: readonly OwnerLoad[]; readonly filter: WorkFilter; readonly onFilter: (filter: WorkFilter) => void;
}) {
  return <Flex wrap gap={space[1]}>
    <Input aria-label="搜索事项" prefix={<SearchOutlined />} placeholder="产品、单号、编码或负责人" allowClear
      style={{ flex: '1 1 220px', minWidth: 0 }} value={filter.search} onChange={(event) => onFilter({ ...filter, search: event.target.value })} />
    <Select<View> aria-label="事项范围" value={filter.view} options={Object.entries(VIEWS).map(([value, label]) => ({ value, label }))}
      onChange={(view) => onFilter({ ...filter, view, signal: undefined })} />
    <Select aria-label="筛选采购负责人" placeholder="全部负责人" allowClear value={filter.owner}
      options={owners.map((owner) => ({ value: owner.id, label: owner.name }))} style={{ minWidth: 120 }}
      onChange={(owner: string | undefined) => onFilter({ ...filter, owner })} />
    <Select aria-label="筛选关注原因" placeholder="全部原因" allowClear value={filter.signal}
      options={Object.entries(SIGNALS).map(([value, label]) => ({ value, label }))} style={{ minWidth: 138 }}
      onChange={(signal: Signal | undefined) => onFilter({ ...filter, signal, view: signal === undefined ? filter.view : 'watch' })} />
  </Flex>;
}

function WorkDrawer({ row, onClose }: { readonly row: WorkRow; readonly onClose: () => void }) {
  const [isOpen, setOpen] = useState(true);
  const { line } = row;
  return <Drawer title={productName(row)} open={isOpen} onClose={() => setOpen(false)}
    size={`min(${drawerWidth}px, 100vw)`} focusable={{ trap: true, focusTriggerAfterClose: true }}
    afterOpenChange={(visible) => { if (!visible) onClose(); }}>
    <Flex vertical gap={space[3]}>
      <Signals row={row} />
      <Descriptions size="small" column={1} items={[
        { key: 'owner', label: '采购负责人', children: line.buyer?.name ?? '待分配' },
        { key: 'po', label: '采购单号', children: line.po.poRaw ?? '无单号' },
        { key: 'stage', label: '当前阶段', children: lineStageLabel(line.stage) },
        { key: 'confirmed', label: '下一确认到货日', children: line.nextDue?.dateBuyerConfirmed ?? '待确认' },
        { key: 'required', label: '对应需求日', children: line.nextDue?.dateFactoryRequired ?? '未填写' },
        { key: 'supplier', label: '供应商', children: line.supplier.displayName ?? line.supplier.rawName ?? '未填写' },
      ]} />
      <RelatedProducts row={row} />
      <Link to={`/lines/${encodeURIComponent(line.id)}`}>打开订单跟进记录</Link>
    </Flex>
  </Drawer>;
}

function RelatedProducts({ row }: { readonly row: WorkRow }) {
  if (row.line.lane !== 'material') return null;
  return <Flex vertical gap={space[1]}>
    <Typography.Text strong>关联的进行中成品和采购负责人</Typography.Text>
    {row.related.length === 0 ? <Typography.Text type="secondary">当前范围未查到关联成品</Typography.Text>
      : row.related.map((parent) => <Link key={parent.id} to={`/lines/${encodeURIComponent(parent.id)}`}>
        {parent.nameRaw ?? parent.po.poRaw ?? '品名待补'} · {parent.buyer?.name ?? '待分配'}</Link>)}
  </Flex>;
}
