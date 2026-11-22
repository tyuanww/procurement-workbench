import { LOW_SAMPLE_THRESHOLD, batchStatusLabel } from '@sw/domain';
import type { ReportRenderer } from '../../../application/src/ports/report-renderer.js';
import type { WeeklyReportData } from '../../../application/src/reporting/views.js';
import { managementMeetingTables } from '../management-meeting.js';
import { write } from './writer.js';

export function xlsxRenderer(): ReportRenderer {
  return { format: 'xlsx', render };
}

export function render(data: WeeklyReportData): Promise<Uint8Array> {
  return Promise.resolve(write({ sheets: sheetsOf(data) }));
}

function sheetsOf(data: WeeklyReportData) {
  return [
    { name: '总览', rows: overview(data) },
    { name: '风险', rows: [['批次', '订单行', '逾期天数', '名称'], ...data.risks.map((row) => [row.batchId, row.orderLineId, row.overdueDays, row.nameRaw])] },
    { name: '卡点', rows: [['阶段', '0-3', '4-7', '8-14', '15+', '阶段码'], ...data.stuck.map((row) => [batchStatusLabel(row.stage), row.buckets['0-3'], row.buckets['4-7'], row.buckets['8-14'], row.buckets['15+'], row.stage])] },
    { name: '供应商', rows: suppliers(data) },
    { name: '采购', rows: [['采购', '未结行', '未结批次', '逾期', '今日应到', '缺日期'], ...data.buyers.map((row) => [row.buyer.name, row.openLines, row.openBatches, row.overdue, row.dueToday, row.missingDate])] },
    { name: '异常', rows: [['新增', '关闭'], [data.exceptions.opened, data.exceptions.closed]] },
    { name: '下周应到', rows: [['批次', '日期', '名称'], ...data.dueNextWeek.map((row) => [row.batchId, row.dueDate, row.nameRaw])] },
    ...managementMeetingTables(data.managementMeeting).map(({ title, headers, rows }) => ({ name: title, rows: [headers, ...rows] })),
    { name: '数据说明', rows: [['缺失值导出为空格子，并批注原因，不写 0。'], ['准时率分母不足时分子仍在，比率留空。']] },
  ];
}

function suppliers(data: WeeklyReportData): (string | number | null)[][] {
  const rows = data.suppliers.map((row) => [
    row.displayName, row.dueBatches.numerator, row.onTime.numerator, row.onTime.denominator,
    row.onTime.n < LOW_SAMPLE_THRESHOLD ? '样本少' : '样本充足', row.dateChanges.numerator, row.openExceptions.numerator,
  ]);
  const unassigned = data.supplierUnassigned;
  return [
    ['供应商', '应到', '准时分子', '准时分母', '准时样本', '改期', '开放异常'],
    ...rows,
    ...(unassigned === undefined ? [] : [['未归属', null, null, null, null, unassigned.dateChanges, unassigned.openExceptions]]),
  ];
}

function overview(data: WeeklyReportData): (string | number | null)[][] {
  return [
    ['指标', '本期', '上期'],
    ['应到批次', data.overview.dueBatches.value, data.overview.dueBatches.previous],
    ['逾期', data.overview.overdue.value, data.overview.overdue.previous],
    ['缺确认日期比例', data.overview.missingDateRate, null],
  ];
}
