import { actionReasonText, orderCodes } from './codes.js';
import { MISSING, missingGlyph } from './glyph.js';
import type { BoardItem, RowFace } from './types.js';

export function faceOf(item: BoardItem): RowFace {
  return {
    reason: orderCodes(item.reasons).map(actionReasonText).join('、'),
    overdue: overdueText(item.overdueDays),
    overdueTone: toneOf(item.overdueDays),
    orderNo: missingGlyph(item.poRaw),
    productName: missingGlyph(item.productName),
    date: item.dueDate === null ? MISSING : item.dueDate,
    ...(item.remaining === undefined ? {} : { remaining: `未发 ${item.qty?.toLocaleString('zh-CN') ?? '—'} ${item.remaining.unit ?? ''}`.trim() }),
    ...(item.latestFollowUp === undefined ? {} : { latestFollowUp: item.latestFollowUp }),
    ...(item.latestPromise === undefined ? {} : { latestPromise: item.latestPromise }),
  };
}

function overdueText(days: number | null): string {
  if (days === null || days <= 0) return MISSING;
  return `逾期 ${days} 天`;
}

function toneOf(days: number | null): RowFace['overdueTone'] {
  if (days !== null && days > 0) return 'danger';
  return 'quiet';
}
