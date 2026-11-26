import type { TodayChaseRow } from '@sw/contracts';
import type { BatchStatus } from '@sw/domain';
import { groupByWaiting } from './group.js';
import { nudgeText, type NudgeLine } from '../nudge-text/model/text.js';
import { missingGlyph } from './glyph.js';
import type { BoardItem } from './types.js';

const BY_REASON: readonly { readonly reason: string; readonly status: NudgeLine['status'] }[] = [
  { reason: 'due_today', status: 'due_today' },
  { reason: 'shipped_not_received', status: 'shipped' },
  { reason: 'missing_date', status: 'unconfirmed' },
];

export function nudgeOf(input: { readonly buyerName: string } & (
  | { readonly items: readonly BoardItem[] }
  | { readonly chase: readonly TodayChaseRow[] }
)): string {
  const parties = 'chase' in input ? chaseParties(input.chase) : groupByWaiting(input.items).map((party) => ({
    name: party.name, lines: party.items.flatMap((item) => lineOf(item)),
  }));
  return parties.flatMap((party) => party.lines.length === 0 ? [] : [
    nudgeText({ waitingName: party.name, buyerName: input.buyerName.trim(), lines: party.lines }),
  ]).join('\n\n');
}

function chaseParties(rows: readonly TodayChaseRow[]): { readonly name: string; readonly lines: NudgeLine[] }[] {
  const parties = new Map<string, { readonly name: string; readonly lines: NudgeLine[] }>();
  for (const row of rows) {
    const party = parties.get(row.factory.id) ?? { name: row.factory.name, lines: [] };
    party.lines.push({
      poRaw: missingGlyph(row.poRaw),
      nameRaw: missingGlyph(row.nameRaw),
      ...(row.batchSeq === undefined ? {} : { batchSeq: row.batchSeq }),
      qty: row.unshippedQty,
      ...(row.unit === null ? {} : { unit: row.unit }),
      dueDate: row.dueDate,
      overdueDays: row.overdueDays,
      status: row.reasons.includes('missing_date') ? 'unconfirmed' : confirmedLine(row),
    });
    parties.set(row.factory.id, party);
  }
  return [...parties.values()];
}

function lineOf(item: BoardItem): NudgeLine[] {
  if (item.waitingKey !== undefined && (!item.waitingKey.startsWith('supplier:') || item.waitingKey === 'supplier:' || item.remaining === undefined)) return [];
  const status = statusOf(item);
  if (status === null) return [];
  return [{
    poRaw: missingGlyph(item.poRaw),
    nameRaw: missingGlyph(item.productName),
    qty: item.qty,
    ...(item.remaining?.unit == null ? {} : { unit: item.remaining.unit }),
    dueDate: item.dueDate,
    status,
    overdueDays: item.overdueDays,
  }];
}

function statusOf(item: BoardItem): NudgeLine['status'] | null {
  if (item.remaining !== undefined) return item.reasons.includes('missing_date') ? 'unconfirmed' : confirmedLine(item);
  if (item.batchStatus === null) return reasonStatus(item);
  return knownLine(item, item.batchStatus);
}

function reasonStatus(item: BoardItem): NudgeLine['status'] | null {
  if (item.reasons.includes('overdue') && item.overdueDays !== null && item.overdueDays > 0) return 'overdue';
  const hit = BY_REASON.find((rule) => item.reasons.includes(rule.reason));
  if (hit !== undefined) return hit.status;
  if (item.reasons.includes('upcoming') || item.reasons.includes('demand_before_confirmed')) return 'confirmed';
  return null;
}

function knownLine(item: BoardItem, status: BatchStatus): NudgeLine['status'] | null {
  switch (status) {
    case 'awaiting_date':
      return 'unconfirmed';
    case 'shipped':
      return 'shipped';
    case 'confirmed':
      return confirmedLine(item);
    case 'partially_received':
    case 'received':
    case 'closed':
    case 'cancelled':
      return null;
  }
}

function confirmedLine(item: Pick<BoardItem, 'overdueDays' | 'reasons'>): NudgeLine['status'] {
  if (item.overdueDays !== null && item.overdueDays > 0) return 'overdue';
  if (item.reasons.includes('due_today')) return 'due_today';
  return 'confirmed';
}
