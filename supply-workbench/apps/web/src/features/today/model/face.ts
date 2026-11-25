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
    waiting: item.waitingKind === 'internal' && item.reasons.includes('note_missing') ? `${item.waitingName}（等回单）` : item.waitingName,
    ...quantitiesOf(item),
    ...(item.latestFollowUp === undefined ? {} : { latestFollowUp: item.latestFollowUp }),
    ...(item.latestPromise === undefined ? {} : { latestPromise: item.latestPromise }),
    ...(item.nextFollowUpAt === undefined ? {} : { nextFollowUpAt: item.nextFollowUpAt }),
  };
}

function quantitiesOf(item: BoardItem): Pick<RowFace, 'remaining' | 'inTransit'> {
  const remaining = item.qty === null ? MISSING : quantity.format(item.qty);
  return {
    ...(item.remaining === undefined ? {} : { remaining: `未发 ${remaining} ${item.remaining.unit ?? ''}`.trim() }),
    ...(item.inTransit === undefined ? {} : { inTransit: `已全发 · 在途待收 ${quantity.format(item.inTransit.qty)} ${item.inTransit.unit}` }),
  };
}

const quantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

function overdueText(days: number | null): string {
  if (days === null || days <= 0) return MISSING;
  return `逾期 ${days} 天`;
}

function toneOf(days: number | null): RowFace['overdueTone'] {
  if (days !== null && days > 0) return 'danger';
  return 'quiet';
}
