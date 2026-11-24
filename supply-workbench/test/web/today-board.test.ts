import { describe, expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { readGroup, readReasons, todayBoard, withGroup, withReason, type BoardItem, type TodayBoard } from '../../apps/web/src/features/today/index.js';
import { toBoardItem } from '../../apps/web/src/pages/today/card.js';

const SHIP = [
  { kind: 'ship', label: '登记发货' },
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const RECEIPT = [
  { kind: 'receipt', label: '登记收货' },
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const DATE = [
  { kind: 'date', label: '改确认日' },
  { kind: 'note', label: '记跟进' },
];
const NOTE = [{ kind: 'note', label: '记跟进' }];
const BANNED = ['登记送货单', '关闭异常', '查看异常'];

function row(overrides: Partial<BoardItem> & { readonly id: string }): BoardItem {
  return {
    severity: 1,
    overdueDays: null,
    dueDate: null,
    lineId: overrides.id,
    waitingName: '宜侬',
    reasons: ['overdue'],
    poRaw: null,
    productName: null,
    qty: null,
    batchStatus: null,
    ...overrides,
  };
}

function project(input: { readonly items: readonly BoardItem[]; readonly reasons?: readonly string[]; readonly group?: string | null; readonly buyerName?: string }): TodayBoard {
  return todayBoard({
    items: input.items,
    reasons: input.reasons ?? [],
    group: input.group === undefined ? null : input.group,
    buyerName: input.buyerName ?? '采购甲',
  });
}

function names(board: TodayBoard): string[] {
  if (board.body.kind !== 'groups') return [];
  return board.body.groups.map((group) => group.name);
}

function memberIds(board: TodayBoard): string[][] {
  if (board.body.kind !== 'groups') return [];
  return board.body.groups.map((group) => group.rows.map((item) => item.id));
}

function flatIds(board: TodayBoard): string[] {
  if (board.body.kind !== 'groups') return [];
  return board.body.rows.map((item) => item.id);
}

const waitingItems = [
  row({ id: 'a', severity: 1, overdueDays: 1, dueDate: '2026-10-10', lineId: 'l2', reasons: ['overdue'] }),
  row({ id: 'b', severity: 3, overdueDays: 4, dueDate: '2026-10-07', lineId: 'l1', reasons: ['overdue', 'due_today'] }),
  row({ id: 'c', severity: 2, overdueDays: null, dueDate: null, lineId: 'l3', waitingName: '样例供应商34', reasons: ['missing_date'] }),
];

describe('今日看板', () => {
  it('等待方沿用 b、a 在宜侬，c 在样例供应商34，表头计数没有原因码', () => {
    const board = project({ items: waitingItems });
    expect(board.group).toBe('waiting');
    expect(names(board)).toEqual(['宜侬', '样例供应商34']);
    expect(memberIds(board)).toEqual([['b', 'a'], ['c']]);
    expect(flatIds(board)).toEqual(['b', 'a', 'c']);
    if (board.body.kind !== 'groups') throw new Error('expected groups');
    expect(board.body.groups[0]?.counts).toEqual([
      { label: '未发逾期', count: 2 },
      { label: '确认日为今天', count: 1 },
    ]);
    expect(board.body.groups[0]?.counts[0]).toEqual({ label: '未发逾期', count: 2 });
  });

  it('原因模式一条进两组，筛选后只留逾期组，扁平行只出现一次', () => {
    const item = row({ id: 'b', severity: 3, overdueDays: 4, dueDate: '2026-10-07', lineId: 'l1', reasons: ['overdue', 'due_today'] });
    const both = project({ items: [item], group: 'reason' });
    expect(names(both)).toEqual(['未发逾期', '确认日为今天']);
    expect(memberIds(both)).toEqual([['b'], ['b']]);
    expect(flatIds(both)).toEqual(['b']);
    const only = project({ items: [item], reasons: ['overdue'], group: 'reason' });
    expect(names(only)).toEqual(['未发逾期']);
    expect(flatIds(only)).toEqual(['b']);
    expect(only.chips).toEqual([
      { code: 'overdue', label: '未发逾期', count: 1, isSelected: true },
      { code: 'due_today', label: '确认日为今天', count: 1, isSelected: false },
    ]);
  });

  it('日期模式按日期升序，空日期用未定日期，不受更高严重度影响', () => {
    const board = project({
      group: 'date',
      items: [
        row({ id: 'late', severity: 3, overdueDays: 1, dueDate: '2026-10-10', lineId: 'l2' }),
        row({ id: 'early', severity: 1, overdueDays: 1, dueDate: '2026-10-01', lineId: 'l1' }),
        row({ id: 'none', severity: 2, overdueDays: null, dueDate: null, lineId: 'l3', waitingName: '样例供应商34', reasons: ['missing_date'] }),
      ],
    });
    expect(names(board)).toEqual(['2026-10-01', '2026-10-10', '未定日期']);
    expect(memberIds(board)).toEqual([['early'], ['late'], ['none']]);
  });

  it('空品名、空白品名、空单号和空逾期都显示破折号', () => {
    const missing = project({ items: [row({ id: 'n', productName: null, poRaw: null, overdueDays: 4, dueDate: '2026-10-07' })] });
    const blank = project({ items: [row({ id: 'w', productName: '   ', overdueDays: null, dueDate: null })] });
    if (missing.body.kind !== 'groups' || blank.body.kind !== 'groups') throw new Error('expected groups');
    expect(missing.body.rows[0]?.face).toEqual({
      reason: '未发逾期',
      overdue: '逾期 4 天',
      overdueTone: 'danger',
      orderNo: '—',
      productName: '—',
      date: '2026-10-07',
    });
    expect(blank.body.rows[0]?.face.productName).toBe('—');
    expect(blank.body.rows[0]?.face.overdue).toBe('—');
    expect(blank.body.rows[0]?.face.overdueTone).toBe('quiet');
  });

  it('动作为状态表或原因表，最多三枚，没有送货单和关闭异常', () => {
    expect(actions({ batchStatus: null, reasons: ['overdue'] })).toEqual(SHIP);
    expect(actions({ batchStatus: null, reasons: ['missing_date'] })).toEqual(DATE);
    expect(actions({ batchStatus: null, reasons: ['shipped_not_received'] })).toEqual(RECEIPT);
    expect(actions({ batchStatus: null, reasons: ['note_missing'] })).toEqual(NOTE);
    expect(actions({ batchStatus: null, reasons: ['overdue', 'note_missing'] })).toEqual(SHIP);
    expect(actions({ batchStatus: 'shipped', reasons: ['overdue'] })).toEqual(RECEIPT);
    expect(actions({ batchStatus: 'partially_received', reasons: ['overdue'] })).toEqual(RECEIPT);
    expect(actions({ batchStatus: 'confirmed', reasons: ['overdue'] })).toEqual(SHIP);
    expect(actions({ batchStatus: 'awaiting_date', reasons: ['missing_date'] })).toEqual(DATE);
    expect(actions({ batchStatus: 'received', reasons: ['note_missing'] })).toEqual(DATE);
    expect(actions({ batchStatus: 'closed', reasons: ['note_missing'] })).toEqual(NOTE);
    expect(actions({ batchStatus: 'cancelled', reasons: ['note_missing'] })).toEqual(NOTE);
    const labels = [SHIP, RECEIPT, DATE, NOTE].flatMap((list) => list.map((action) => action.label));
    expect(labels.filter((label) => BANNED.includes(label))).toEqual([]);
    expect(SHIP).toHaveLength(3);
  });

  it('无批次的逾期催办带采购前缀、逾期天数和破折号品名', () => {
    const board = project({
      buyerName: '采购甲',
      items: [row({ id: 'b', waitingName: '宜侬', productName: null, poRaw: null, qty: null, overdueDays: 4, dueDate: '2026-10-07', reasons: ['overdue'], batchStatus: null })],
    });
    if (board.body.kind !== 'groups') throw new Error('expected groups');
    expect(board.body.groups[0]?.nudgeText).toBe([
      '【SHINEMAGE 采购】宜侬您好，以下批次请协助确认：',
      '1. — — —，确认到货 2026-10-07，已逾期 4 天，请回复发货情况。',
      '谢谢！— 采购甲',
    ].join('\n'));
    const unnamed = project({
      buyerName: '',
      items: [row({ id: 'b', waitingName: '宜侬', productName: null, poRaw: null, qty: null, overdueDays: 4, dueDate: '2026-10-07', reasons: ['overdue'], batchStatus: null })],
    });
    if (unnamed.body.kind !== 'groups') throw new Error('expected groups');
    expect(unnamed.body.groups[0]?.nudgeText.endsWith('谢谢！')).toBe(true);
    expect(unnamed.body.groups[0]?.nudgeText).not.toContain('谢谢！—');
    const noteOnly = project({ items: [row({ id: 'n', reasons: ['note_missing'], overdueDays: null })] });
    const upcoming = project({ items: [row({ id: 'u', reasons: ['upcoming'], overdueDays: null, dueDate: '2026-10-20' })] });
    if (noteOnly.body.kind !== 'groups' || upcoming.body.kind !== 'groups') throw new Error('expected groups');
    expect(noteOnly.body.groups[0]?.nudgeText).not.toContain('已确认未到');
    expect(upcoming.body.groups[0]?.nudgeText).toContain('已确认未到');
  });

  it('没有事项时用固定空文案', () => {
    expect(project({ items: [] }).body).toEqual({ kind: 'empty', text: '今天没有需要处理的事。下一步：去跟进中心看看。' });
  });

  it('原因参数可切换并保留分组，等待方会删掉 group', () => {
    const selected = withReason({ search: '', code: 'overdue' });
    expect(selected).toContain('reasons=overdue');
    expect(withReason({ search: selected, code: 'overdue' })).not.toContain('reasons=');
    const kept = withReason({ search: 'group=date', code: 'overdue' });
    expect(kept).toContain('reasons=overdue');
    expect(kept).toContain('group=date');
    expect(withReason({ search: kept, code: 'overdue' })).toContain('group=date');
    expect(withReason({ search: kept, code: 'overdue' })).not.toContain('reasons=');
    const dated = withGroup({ search: 'reasons=overdue', group: 'date' });
    expect(dated).toContain('reasons=overdue');
    expect(dated).toContain('group=date');
    const waiting = withGroup({ search: dated, group: 'waiting' });
    expect(waiting).toContain('reasons=overdue');
    expect(waiting).not.toContain('group=');
    expect(readReasons('reasons=overdue,due_today')).toEqual(['overdue', 'due_today']);
    expect(readReasons('')).toEqual([]);
    expect(readGroup('group=date')).toBe('date');
    expect(readGroup('group=reason')).toBe('reason');
    expect(readGroup('')).toBe('waiting');
    expect(readGroup('group=nope')).toBe('waiting');
  });

  it('空行、空批次、空显示名映射为工厂未分组，不把条码或品号当成品名', () => {
    const mapped = toBoardItem(bareView());
    expect(mapped.waitingName).toBe('工厂未分组');
    const named = toBoardItem({ ...bareView(), waitingOnParty: { id: 'p1', displayName: null, rawName: '原料名' } });
    expect(named.waitingName).toBe('原料名');
    const shown = toBoardItem({ ...bareView(), waitingOnParty: { id: 'p1', displayName: '宜侬', rawName: '原料名' } });
    expect(shown.waitingName).toBe('宜侬');
    expect(mapped.productName).toBeNull();
    expect(mapped.batchStatus).toBeNull();
    const coded = toBoardItem(viewWithCodes());
    expect(coded.productName).toBeNull();
    expect(JSON.stringify(coded)).not.toContain('SKU-9');
    expect(JSON.stringify(coded)).not.toContain('6901234567890');
  });
});

function actions(input: { readonly batchStatus: BoardItem['batchStatus']; readonly reasons: readonly string[] }) {
  const board = project({
    items: [row({ id: 'x', batchStatus: input.batchStatus, reasons: input.reasons, overdueDays: 4, dueDate: '2026-10-07' })],
  });
  if (board.body.kind !== 'groups') return [];
  return board.body.rows[0]?.actions ?? [];
}

function bareView(): TodoItemView {
  return {
    id: 'todo-1',
    subject: 'batch',
    reasons: ['overdue'],
    severity: 3,
    ownerUserId: null,
    waitingOn: { kind: 'supplier', partyId: null },
    dueDate: localDate('2026-10-07'),
    overdueDays: 4,
    refs: { orderLineId: 'line-1', batchId: 'batch-1' },
    line: null,
    batch: null,
    waitingOnParty: { id: null, displayName: null, rawName: null },
    exception: null,
  };
}

function viewWithCodes(): TodoItemView {
  return {
    ...bareView(),
    line: {
      id: 'line-1',
      lane: 'finished',
      poRaw: null,
      poFormat: 'NONE',
      nameRaw: null,
      itemCodeRaw: 'SKU-9',
      barcodeRaw: '6901234567890',
      buyerName: '采购乙',
    },
  };
}
