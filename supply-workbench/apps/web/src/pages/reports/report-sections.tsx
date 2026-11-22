import { Descriptions, Table } from 'antd';
import type { WeeklyReport } from '@sw/contracts';
import { batchStatusLabel, type BatchStatus } from '@sw/domain';
import { MeetingSections, meetingStoreLabels } from '../../features/reporting/index.js';
import { SectionGroup as WorkbenchSectionGroup } from '../../shared/ui/section.js';

export function ReportSections(input: { readonly data: WeeklyReport['data']; readonly print?: boolean }) {
  const data = input.data;
  return (
    <>
      <OverviewSection data={data} />
      <RisksSection data={data} />
      <StuckSection data={data} />
      <SuppliersSection data={data} />
      <BuyersSection data={data} />
      <ExceptionsSection data={data} />
      <DueNextSection data={data} />
      <NotesSection data={data} />
      {data.managementMeeting?.filter((meeting) => meeting.materials.length + meeting.development.length + meeting.decisions.length > 0).map((meeting) =>
        <WorkbenchSectionGroup key={meeting.store} title={`管理周会 · ${meetingStoreLabels[meeting.store]}`}>
          <MeetingSections meeting={meeting} print={input.print === true} />
        </WorkbenchSectionGroup>,
      )}
    </>
  );
}

function OverviewSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="总览" meta={`应到 ${valueOrDash(data.overview.dueBatches.value)} · 逾期 ${valueOrDash(data.overview.overdue.value)}`}><Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} items={[
    { key: 'due', label: '应到批次', children: valueOrDash(data.overview.dueBatches.value) },
    { key: 'on-time', label: '准时到货率', children: data.overview.onTime.value.rate === null ? '—' : `${Math.round(data.overview.onTime.value.rate * 100)}%` },
    { key: 'overdue', label: '当前逾期', children: valueOrDash(data.overview.overdue.value) },
    { key: 'opened', label: '异常新增', children: data.overview.exceptionsOpened },
    { key: 'closed', label: '异常关闭', children: data.overview.exceptionsClosed },
    { key: 'missing', label: '缺确认日期率', children: data.overview.missingDateRate === null ? '—' : `${Math.round(data.overview.missingDateRate * 100)}%` },
  ]} /></WorkbenchSectionGroup>;
}

function RisksSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="风险批次" meta={`${data.risks.length} 条`}><Table size="small" pagination={false} rowKey="batchId" dataSource={data.risks} columns={[
    { title: '批次', dataIndex: 'batchId' },
    { title: '订单行', dataIndex: 'orderLineId' },
    { title: '逾期天数', dataIndex: 'overdueDays', render: valueOrDash },
    { title: '名称', dataIndex: 'nameRaw', render: (value: string | null) => value ?? '未命名' },
  ]} /></WorkbenchSectionGroup>;
}

function StuckSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="卡点分布"><Table size="small" pagination={false} rowKey="stage" dataSource={data.stuck} columns={[
    { title: '状态', dataIndex: 'stage', render: (stage: BatchStatus) => batchStatusLabel(stage) },
    { title: '0-3', dataIndex: ['buckets', '0-3'] },
    { title: '4-7', dataIndex: ['buckets', '4-7'] },
    { title: '8-14', dataIndex: ['buckets', '8-14'] },
    { title: '15+', dataIndex: ['buckets', '15+'] },
  ]} /></WorkbenchSectionGroup>;
}

function SuppliersSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="供应商表现" meta={`${data.suppliers.length} 家`}><Table size="small" pagination={false} rowKey="partyId" dataSource={data.suppliers} columns={[
    { title: '供应商', dataIndex: 'displayName', render: (value: string | null, row: (typeof data.suppliers)[number]) => value ?? row.partyId },
    { title: '应到批次', dataIndex: ['dueBatches', 'numerator'], render: valueOrDash },
    { title: '准时到货率', render: (_value: unknown, row: (typeof data.suppliers)[number]) => supplierRate(row.onTime) },
    { title: '当前逾期', dataIndex: ['overdueNow', 'numerator'], render: valueOrDash },
    { title: '开放异常', dataIndex: ['openExceptions', 'numerator'], render: valueOrDash },
  ]} /></WorkbenchSectionGroup>;
}

function BuyersSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="采购负荷" meta={`${data.buyers.length} 位负责人`}><Table size="small" pagination={false} rowKey={(row) => row.buyer.id} dataSource={data.buyers} columns={[
    { title: '负责人', dataIndex: ['buyer', 'name'], render: (value: string | null, row: (typeof data.buyers)[number]) => value ?? row.buyer.id },
    { title: '在跟订单行', dataIndex: 'openLines', render: valueOrDash },
    { title: '开放批次', dataIndex: 'openBatches' },
    { title: '逾期', dataIndex: 'overdue' },
    { title: '今日应到', dataIndex: 'dueToday' },
    { title: '开放异常', dataIndex: 'openExceptions', render: valueOrDash },
    { title: '期间跟进', dataIndex: 'followUpsInPeriod', render: valueOrDash },
  ]} /></WorkbenchSectionGroup>;
}

function ExceptionsSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="异常处理"><Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'opened', label: '本周新增', children: data.exceptions.opened }, { key: 'closed', label: '本周关闭', children: data.exceptions.closed }]} /></WorkbenchSectionGroup>;
}

function DueNextSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="下周应到" meta={`${data.dueNextWeek.length} 批`}><Table size="small" pagination={false} rowKey="batchId" dataSource={data.dueNextWeek} columns={[{ title: '批次', dataIndex: 'batchId' }, { title: '日期', dataIndex: 'dueDate' }, { title: '名称', dataIndex: 'nameRaw', render: (value: string | null) => value ?? '未命名' }]} /></WorkbenchSectionGroup>;
}

function NotesSection({ data }: { readonly data: WeeklyReport['data'] }) {
  return <WorkbenchSectionGroup title="数据来源与口径" meta={`${data.notes.sources.length} 个来源`}><Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[{ key: 'basis', label: '数据基础', children: data.notes.basedOnWorkbenchRecords ? '基于工作台登记' : '未知' }, { key: 'sources', label: '来源数量', children: data.notes.sources.length }]} /></WorkbenchSectionGroup>;
}

function valueOrDash(value: number | null): string | number {
  return value === null ? '—' : value;
}

function supplierRate(value: { readonly numerator: number | null; readonly denominator: number | null }): string {
  if (value.numerator === null || value.denominator === null || value.denominator === 0) return '—';
  return `${Math.round((value.numerator / value.denominator) * 100)}%`;
}
