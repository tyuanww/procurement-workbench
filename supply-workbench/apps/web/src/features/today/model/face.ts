import { actionReasonText, orderCodes } from './codes.js';
import { MISSING, missingGlyph } from './glyph.js';
import type { BoardItem, RowFace } from './types.js';

export function faceOf(item: BoardItem): RowFace {
  const overdueDays = item.reasons.includes('overdue') ? item.overdueDays : null;
  return {
    reason: orderCodes(item.reasons).map(actionReasonText).join('、'),
    overdue: overdueText(overdueDays),
    overdueTone: toneOf(overdueDays),
    orderNo: missingGlyph(item.poRaw),
    productName: missingGlyph(item.productName),
    date: item.dueDate === null ? MISSING : item.dueDate,
    ...quantitiesOf(item),
    ...(item.latestFollowUp === undefined ? {} : { latestFollowUp: item.latestFollowUp }),
    ...(item.latestPromise === undefined ? {} : { latestPromise: item.latestPromise }),
    ...(item.nextFollowUpAt === undefined ? {} : { nextFollowUpAt: item.nextFollowUpAt }),
  };
}

function quantitiesOf(item: BoardItem): Pick<RowFace, 'remaining' | 'inTransit'> {
  return {
    ...(item.remaining === undefined ? {} : { remaining: `未发 ${item.qty?.toLocaleString('zh-CN') ?? '—'} ${item.remaining.unit ?? ''}`.trim() }),
    ...(item.inTransit === undefined ? {} : { inTransit: `已全发 · 在途待收 ${item.inTransit.qty.toLocaleString('zh-CN')} ${item.inTransit.unit}` }),
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
