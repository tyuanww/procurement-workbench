import { Button, Empty, Table, Typography, type TableProps } from 'antd';
import type { ManagementDecision, ManagementMeetingSnapshot, MeetingMaterial, MeetingWaitingOn } from '@sw/contracts';
import { SectionGroup } from '../../../shared/ui/section.js';

const number = new Intl.NumberFormat('zh-CN');

const WAITING_LABEL: Record<MeetingWaitingOn, string> = {
  verification: '待核实凭据',
  buyer: '等采购确认',
  supplier: '等供应商发货',
  receiver: '等收货方点收',
  none: '无待处理履约',
};

export const meetingStoreLabels = {
  dafuyan: '达肤妍', yiling: '译龄', unassigned: '未分店铺',
} satisfies Record<ManagementMeetingSnapshot['store'], string>;

export function MeetingSections({ meeting, print = false, onRecord, onComplete }: {
  readonly meeting: ManagementMeetingSnapshot;
  readonly print?: boolean;
  readonly onRecord?: (row: MeetingMaterial) => void;
  readonly onComplete?: (row: ManagementDecision) => void;
}) {
  return <>
    <SectionGroup title="采购事项" meta={summary(meeting.materials)}>
      <Table<MeetingMaterial>
        size="small" rowKey="materialLineId" dataSource={meeting.materials} columns={materialColumns(onRecord)}
        {...tableLayout(print)} locale={{ emptyText: <Typography.Text type="secondary">这个店铺没有采购事项。</Typography.Text> }}
        expandable={{
          rowExpandable: (row) => row.batches.length > 0 || row.sourceReportedProgress !== null,
          expandedRowRender: (row) => <MaterialDetails row={row} />,
          defaultExpandAllRows: print,
        }}
      />
    </SectionGroup>
    {meeting.development.length === 0 ? null : <DevelopmentTable rows={meeting.development} print={print} />}
    <DecisionTable meeting={meeting} print={print} {...(onComplete === undefined ? {} : { onComplete })} />
  </>;
}

function summary(rows: readonly MeetingMaterial[]): string {
  const totals = new Map<string, number>();
  const affected = new Set<string>();
  for (const row of rows) {
    for (const item of row.affectedFinished) affected.add(item.id);
    if (row.sourceReportedGap === null || row.unit === null) continue;
    totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.sourceReportedGap);
  }
  const gap = [...totals].map(([unit, sum]) => qty(sum, unit)).join('、');
  return `${rows.length} 条采购事项 · ${affected.size} 款本周受影响成品${gap === '' ? '' : ` · 源表报告差额 ${gap}`}`;
}

function materialColumns(onRecord: ((row: MeetingMaterial) => void) | undefined): NonNullable<TableProps<MeetingMaterial>['columns']> {
  return [
    { key: 'name', title: '采购事项', render: (_value, row) => <><Typography.Text strong>{row.name ?? row.code ?? '未命名物料'}</Typography.Text><br /><Typography.Text type="secondary">{[row.code, row.poRef].filter(Boolean).join(' · ')}</Typography.Text></> },
    { key: 'quantity', title: '源表数量', render: (_value, row) => <>
      <div>订购 {qty(row.orderedQty, row.unit)}</div>
      <div>报告已送 {qty(row.sourceReportedQty, row.unit)}</div>
      <div>报告差额 {qty(row.sourceReportedGap, row.unit)}</div>
    </> },
    { key: 'actual', title: '当前核实数量', render: (_value, row) => <>
      <div>实发 {qty(row.verifiedShippedQty, row.unit)}</div>
      <div>实收 {qty(row.verifiedReceivedQty, row.unit)}</div>
      {row.quantityNeedsReview ? <Typography.Text type="secondary">有数量待核</Typography.Text> : null}
    </> },
    { key: 'commitment', title: '上周末承诺 / 当前确认到货', render: (_value, row) => row.batches.length === 0 ? '暂无批次' : row.batches.map((batch) =>
      <div key={batch.id}>批次 {batch.seq} · {batch.previousPromise?.date ?? (batch.previousPromiseText === null ? '待核实' : '见承诺原话')} / {batch.confirmedArrival ?? '待确认'}</div>,
    ) },
    { key: 'waitingOn', title: '当前等待方', render: (_value, row) => row.waitingOn.map((party) => <div key={party}>{waitingLabel(row, party)}</div>) },
    { key: 'affected', title: '本周受影响成品', render: (_value, row) => row.affectedFinished.length === 0 ? '—' : row.affectedFinished.map((item) =>
      <div key={item.id}>{item.name ?? '未命名成品'}{item.oaRef === null ? '' : ` · ${item.oaRef}`}</div>,
    ) },
    ...(onRecord === undefined ? [] : [{ key: 'record', title: '操作', render: (_value: unknown, row: MeetingMaterial) => <Button onClick={() => onRecord(row)}>记录决定</Button> }]),
  ];
}

function MaterialDetails({ row }: { readonly row: MeetingMaterial }) {
  return <>
    {row.sourceReportedProgress === null ? null : <Typography.Paragraph>
      {row.sourceReportedProgress}<br />
      <Typography.Text type="secondary">{row.source.sheetName} 第 {row.source.rowNo} 行 · {row.source.importBatchId}</Typography.Text>
    </Typography.Paragraph>}
    {row.batches.length === 0 ? null : <Table size="small" rowKey="id" pagination={false} dataSource={row.batches} columns={[
      { key: 'seq', title: '批次', dataIndex: 'seq' },
      { key: 'last', title: '上周末承诺及来源', render: (_value, batch) => batch.previousPromise === null ? '待核实' :
        `${batch.previousPromise.date} · ${batch.previousPromise.source === 'change' ? '日期变更' : '批次登记'} ${batch.previousPromise.recordedAt}` },
      { key: 'reply', title: '上周末承诺原话', render: (_value, batch) => batch.previousPromiseText === null ? '—' : <>
        <div style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{batch.previousPromiseText.text}</div>
        <Typography.Text type="secondary">{batch.previousPromiseText.recordedAt}</Typography.Text>
      </> },
      { key: 'current', title: '当前供应商承诺', render: (_value, batch) => batch.currentPromise ?? '待核实' },
      { key: 'factory', title: '工厂要求日', render: (_value, batch) => batch.factoryRequired ?? '—' },
      { key: 'arrive', title: '采购确认到货', render: (_value, batch) => batch.confirmedArrival ?? '待确认' },
      { key: 'waiting', title: '等待方', render: (_value, batch) => batch.waitingOn.map((party) => waitingLabel(row, party)).join('、') },
    ]} />}
  </>;
}

function DevelopmentTable({ rows, print }: { readonly rows: ManagementMeetingSnapshot['development']; readonly print: boolean }) {
  return <SectionGroup title="本周新品风险">
    <Table size="small" rowKey="id" dataSource={rows} {...tableLayout(print)} columns={[
      { key: 'project', title: '新品项目', dataIndex: 'projectName' },
      { key: 'name', title: '节点', dataIndex: 'name' },
      { key: 'day', title: '要求日期', dataIndex: 'plannedEnd' },
      { key: 'destination', title: '送达地点', render: (_value, row) => row.destination === 'factory' ? '到加工厂' : '入仓' },
      { key: 'owner', title: '采购负责人', render: (_value, row) => row.ownerName ?? '待分配' },
      { key: 'latestReply', title: '最新回复', render: (_value, row) => row.latestReply?.text ?? '等采购回复' },
    ]} />
  </SectionGroup>;
}

function DecisionTable({ meeting, print, onComplete }: {
  readonly meeting: ManagementMeetingSnapshot;
  readonly print: boolean;
  readonly onComplete?: (row: ManagementDecision) => void;
}) {
  const materials = new Map(meeting.materials.map((row) => [row.materialLineId, row]));
  const rows = meeting.decisions;
  return <SectionGroup title="会议决定" meta="当周、上周及仍在跟进的决定">
    {rows.length === 0 ? <Empty description="没有会议决定。" /> :
      <Table<ManagementDecision> size="small" rowKey="id" dataSource={rows} {...tableLayout(print)} columns={[
        { key: 'decision', title: '决定 / 采购事项', render: (_value, row) => {
          const material = materials.get(row.materialLineId);
          return <><div>{row.decision}</div><Typography.Text type="secondary">{material?.name ?? row.materialLineId} · {row.weekStart}</Typography.Text></>;
        } },
        { key: 'owner', title: '负责人 / 截止日', render: (_value, row) => <>{row.owner.name}<br />{row.dueDate}</> },
        { key: 'decider', title: '记录人', render: (_value, row) => row.decidedBy.name },
        { key: 'evidence', title: '完成依据', render: (_value, row) => <>
          <div>{row.completionCriteria}</div>
          {row.completion === null ? <Typography.Text type="secondary">待完成</Typography.Text> : <div>已完成 · {row.completion.evidence} · {row.completion.by.name}</div>}
        </> },
        ...(onComplete === undefined ? [] : [{ key: 'complete', title: '操作', render: (_value: unknown, row: ManagementDecision) =>
          row.completion === null ? <Button onClick={() => onComplete(row)}>登记完成</Button> : null }]),
      ]} />}
  </SectionGroup>;
}

function tableLayout(print: boolean): Pick<TableProps<never>, 'pagination' | 'scroll'> {
  return print ? { pagination: false } : { scroll: { x: 'max-content' } };
}

function qty(value: number | null, unit: string | null): string {
  return value === null ? '待核实' : `${number.format(value)} ${unit ?? '（单位待核）'}`;
}

function waitingLabel(row: MeetingMaterial, party: MeetingWaitingOn): string {
  const name = party === 'buyer' ? row.buyerName : party === 'supplier' ? row.supplierName : party === 'receiver' ? row.receiverName : null;
  return name === null ? WAITING_LABEL[party] : `${WAITING_LABEL[party]} · ${name}`;
}
