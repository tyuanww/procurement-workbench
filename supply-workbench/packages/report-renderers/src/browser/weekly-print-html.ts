import type { WeeklyReport } from '../../../application/src/reporting/views.js';
import { managementMeetingTables } from '../management-meeting.js';

export function renderWeeklyPrintHtml(report: WeeklyReport): string {
  const data = report.data;
  return `<!doctype html><html><head><meta charset="utf-8"><title>周报 ${escapeHtml(report.weekStart)}</title><style>${printCss()}</style></head><body><main><header><h1>周报 ${escapeHtml(report.weekStart)} 到 ${escapeHtml(report.weekEnd)}</h1><p>报告编号 ${escapeHtml(report.id)}。生成于 ${escapeHtml(report.generatedAt)}。</p></header>${overviewHtml(data)}${risksHtml(data)}${stuckHtml(data)}${suppliersHtml(data)}${buyersHtml(data)}${exceptionsHtml(data)}${dueNextHtml(data)}${managementHtml(data)}${notesHtml(data)}</main></body></html>`;
}

function managementHtml(data: WeeklyReport['data']): string {
  return managementMeetingTables(data.managementMeeting).map(({ title, headers, rows }, index) =>
    section({ id: `management-meeting-${index}`, title, body: table(headers, rows) }),
  ).join('');
}

function overviewHtml(data: WeeklyReport['data']): string {
  const overview = data.overview;
  return section({ id: 'overview', title: '总览', body: `<p>应到批次 ${numberOrDash(overview.dueBatches.value)}。准时到货率 ${rateOrDash(overview.onTime.value.rate)}。当前逾期 ${numberOrDash(overview.overdue.value)}。开放异常 ${overview.exceptionsOpened} 新增，${overview.exceptionsClosed} 关闭。</p>` });
}

function risksHtml(data: WeeklyReport['data']): string {
  return section({ id: 'risks', title: '风险批次', body: table(['批次', '订单行', '逾期天数', '名称'], data.risks.map((row) => [row.batchId, row.orderLineId, numberOrDash(row.overdueDays), row.nameRaw ?? '未命名'])) });
}

function stuckHtml(data: WeeklyReport['data']): string {
  return section({ id: 'stuck', title: '卡点分布', body: table(['状态', '0-3', '4-7', '8-14', '15+'], data.stuck.map((row) => [row.stage, row.buckets['0-3'], row.buckets['4-7'], row.buckets['8-14'], row.buckets['15+']])) });
}

function suppliersHtml(data: WeeklyReport['data']): string {
  return section({ id: 'suppliers', title: '供应商表现', body: table(['供应商', '应到批次', '准时到货率', '当前逾期', '开放异常'], data.suppliers.map((row) => [row.displayName ?? row.partyId, row.dueBatches.numerator ?? '—', row.onTime.numerator === null || row.onTime.denominator === null || row.onTime.denominator === 0 ? '—' : `${Math.round((row.onTime.numerator / row.onTime.denominator) * 100)}%`, row.overdueNow.numerator ?? '—', row.openExceptions.numerator ?? '—'])) });
}

function buyersHtml(data: WeeklyReport['data']): string {
  return section({ id: 'buyers', title: '采购负荷', body: table(['负责人', '在跟订单行', '开放批次', '逾期', '今日应到', '开放异常', '期间跟进'], data.buyers.map((row) => [row.buyer.name ?? row.buyer.id, row.openLines ?? '—', row.openBatches, row.overdue, row.dueToday, row.openExceptions ?? '—', row.followUpsInPeriod ?? '—'])) });
}

function exceptionsHtml(data: WeeklyReport['data']): string {
  return section({ id: 'exceptions', title: '异常处理', body: `<p>本周新增 ${data.exceptions.opened} 条。关闭 ${data.exceptions.closed} 条。当前报告冻结时点以总览和来源说明为准。</p>` });
}

function dueNextHtml(data: WeeklyReport['data']): string {
  return section({ id: 'due-next-week', title: '下周应到', body: table(['批次', '日期', '名称'], data.dueNextWeek.map((row) => [row.batchId, row.dueDate, row.nameRaw ?? '未命名'])) });
}

function notesHtml(data: WeeklyReport['data']): string {
  return section({ id: 'notes', title: '数据来源与口径', body: `<p>数据基于工作台登记。来源 ${data.notes.sources.length} 个。报告内容在生成时冻结。</p>` });
}

function section(input: { readonly id: string; readonly title: string; readonly body: string }): string {
  return `<section data-section="${input.id}"><h2>${input.title}</h2>${input.body}</section>`;
}

function table(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const head = headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('');
  const body = rows.length === 0 ? `<tr><td colspan="${headers.length}">暂无数据</td></tr>` : rows.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(String(item))}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function numberOrDash(value: number | null): string | number {
  return value === null ? '—' : value;
}

function rateOrDash(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function printCss(): string {
  return 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;margin:32px}main{max-width:1120px;margin:0 auto}h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:0 0 12px}section{margin:0 0 28px;break-inside:avoid}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #d9d9d9;text-align:left;padding:8px}th{background:#f5f5f5}p{line-height:1.6;color:#4b5563}section[data-section^="management-meeting"]{break-inside:auto}section[data-section^="management-meeting"] td{white-space:pre-line;overflow-wrap:anywhere}';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
