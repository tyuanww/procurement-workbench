import { describe, expect, it } from 'vitest';
import { filterReasons, groupByWaiting, nextFocus, shortcutAction, sortTodos, type TodoRow } from '../../apps/web/src/features/today/model/group.js';
import { todoReasonText } from '../../packages/domain/src/index.js';
import { dateChangeErrors, exceptionErrors, followUpErrors, receiptDefaults, receiptErrors, shipmentDefaults, shipmentErrors } from '../../apps/web/src/features/follow-up/record-forms/defaults.js';

const rows: TodoRow[] = [
  { id: 'a', severity: 1, overdueDays: 1, dueDate: '2026-10-10', lineId: 'l2', waitingName: '宜侬', reasons: ['overdue'] },
  { id: 'b', severity: 3, overdueDays: 4, dueDate: '2026-10-07', lineId: 'l1', waitingName: '宜侬', reasons: ['overdue', 'due_today'] },
  { id: 'c', severity: 2, overdueDays: null, dueDate: null, lineId: 'l3', waitingName: '样例供应商34', reasons: ['missing_date'] },
];

describe('今日分组和表单', () => {
  it('按严重度、逾期、到期日排序，再按等待方分组', () => {
    expect(sortTodos(rows).map((row) => row.id)).toEqual(['b', 'c', 'a']);
    expect(groupByWaiting(rows).map((group) => group.name)).toEqual(['宜侬', '样例供应商34']);
    expect(filterReasons(rows, ['missing_date']).map((row) => row.id)).toEqual(['c']);
  });

  it('登记后焦点移到下一条，快捷键对应动作', () => {
    expect(nextFocus(sortTodos(rows), 'b')).toBe('c');
    expect(shortcutAction('r')).toBe('receipt');
    expect(shortcutAction('d')).toBe('date');
    expect(shortcutAction('s')).toBe('ship');
    expect(shortcutAction('n')).toBe('note');
    expect(shortcutAction('e')).toBe('exception');
    expect(shortcutAction('?')).toBe('help');
    expect(shortcutAction('x')).toBeNull();
  });

  it('收货默认数量是计划减已收，晚于今天不通过，改期要原因', () => {
    expect(receiptDefaults({ plannedQty: 10, receivedQty: 4, today: '2026-10-12', lane: 'finished' })).toMatchObject({ qty: 6, category: 'finished' });
    expect(receiptErrors({ qty: 0, receivedOn: '2026-10-13', today: '2026-10-12' })).toEqual(['数量必须大于 0', '收货日不能晚于今天']);
    expect(dateChangeErrors({ isFirst: false, reason: '' })).toEqual(['改已有确认日必须写原因']);
    expect(shipmentDefaults({ plannedQty: 10, shippedQty: 7, today: '2026-10-12' })).toMatchObject({ qty: 3, shippedOn: '2026-10-12' });
    expect(shipmentErrors({ qty: 0, shippedOn: '2026-10-14', today: '2026-10-12' })).toEqual(['数量必须大于 0', '发货日不能晚于明天']);
    expect(followUpErrors({ text: '  ' })).toEqual(['跟进内容必填']);
    expect(exceptionErrors({ note: '' })).toEqual(['说明必填']);
  });

  it('note_missing 显示送货单未回，overdue 显示逾期未到，未知码保持原样', () => {
    expect(todoReasonText('note_missing')).toBe('送货单未回');
    expect(todoReasonText('overdue')).toBe('逾期未到');
    expect(todoReasonText('nope')).toBe('nope');
  });

  it('等键保持输入顺序，行号更小的在前，空日期排在有日期之后', () => {
    const tie = { severity: 2, overdueDays: 3, dueDate: '2026-10-08', lineId: 'l9', waitingName: '宜侬', reasons: ['overdue'] };
    const left = { ...tie, id: 'left' };
    const right = { ...tie, id: 'right' };
    expect(sortTodos([left, right]).map((row) => row.id)).toEqual(['left', 'right']);
    expect(sortTodos([right, left]).map((row) => row.id)).toEqual(['right', 'left']);
    const laterLine = { ...tie, id: 'later', lineId: 'l2' };
    const earlierLine = { ...tie, id: 'earlier', lineId: 'l1' };
    expect(sortTodos([laterLine, earlierLine]).map((row) => row.id)).toEqual(['earlier', 'later']);
    const nullLate = { ...tie, id: 'null-late', dueDate: null, lineId: 'l8' };
    const nullEarly = { ...tie, id: 'null-early', dueDate: null, lineId: 'l0' };
    expect(sortTodos([nullLate, nullEarly]).map((row) => row.id)).toEqual(['null-early', 'null-late']);
    const dated = { ...tie, id: 'dated', dueDate: '2026-10-08', lineId: 'l9' };
    const undated = { ...tie, id: 'undated', dueDate: null, lineId: 'l0' };
    expect(sortTodos([undated, dated]).map((row) => row.id)).toEqual(['dated', 'undated']);
  });
});
