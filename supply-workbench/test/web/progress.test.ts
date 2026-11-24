import { describe, expect, it } from 'vitest';
import {
  arrivalPaint,
  progressRows,
  type ProgressLine,
  type ProgressNudge,
  type ProgressRow,
  type ProgressStay,
} from '../../apps/web/src/features/progress/model/rows.js';

const lines: ProgressLine[] = [
  { id: 'open', nameRaw: '棉片', poRaw: 'PO1', stage: 'awaiting_shipment', daysInStage: 2, supplier: { displayName: '宜侬', rawName: null }, nextDue: null },
  { id: 'stuck', nameRaw: '海葡萄', poRaw: 'PO2', stage: 'awaiting_receipt', daysInStage: 9, supplier: { displayName: null, rawName: '海葡萄厂' }, nextDue: null },
  { id: 'done', nameRaw: '已完成', poRaw: 'PO3', stage: 'done', daysInStage: 30, supplier: { displayName: null, rawName: null }, nextDue: { dateBuyerConfirmed: '2026-10-01', overdueDays: 9 } },
  { id: 'cancelled', nameRaw: '已取消', poRaw: 'PO4', stage: 'cancelled', daysInStage: 12, supplier: { displayName: '瑾亭', rawName: null }, nextDue: { dateBuyerConfirmed: '2026-09-01', overdueDays: 20 } },
];

const nudges: ProgressNudge[] = [
  { lineId: 'stuck', severity: 3, reasons: ['overdue', 'note_missing'] },
  { lineId: 'stuck', severity: 1, reasons: ['upcoming'] },
];

const base: ProgressLine = {
  id: 'row',
  nameRaw: '品',
  poRaw: 'PO',
  stage: 'awaiting_shipment',
  daysInStage: 2,
  supplier: { displayName: null, rawName: null },
  nextDue: null,
};

const stays: readonly { readonly days: number; readonly stay: ProgressStay; readonly dayText: string }[] = [
  { days: -2, stay: '0-3', dayText: '-2' },
  { days: -5, stay: '0-3', dayText: '-5' },
  { days: 0, stay: '0-3', dayText: '0' },
  { days: 3, stay: '0-3', dayText: '3' },
  { days: 4, stay: '4-7', dayText: '4' },
  { days: 7, stay: '4-7', dayText: '7' },
  { days: 8, stay: '8-14', dayText: '8' },
  { days: 14, stay: '8-14', dayText: '14' },
  { days: 15, stay: '15+', dayText: '15' },
  { days: 40, stay: '15+', dayText: '40' },
];

const unprovenOverdueDays: readonly (number | null)[] = [null, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

const blankDates: readonly (string | null)[] = [null, '', '   '];

const supplierCases: readonly { readonly displayName: string | null; readonly rawName: string | null; readonly supplierLabel: string }[] = [
  { displayName: '宜侬', rawName: '其他', supplierLabel: '宜侬' },
  { displayName: '宜 侬', rawName: null, supplierLabel: '宜 侬' },
  { displayName: '  宜侬  ', rawName: '其他', supplierLabel: '宜侬' },
  { displayName: null, rawName: '海葡萄厂', supplierLabel: '海葡萄厂' },
  { displayName: '', rawName: '海葡萄厂', supplierLabel: '海葡萄厂' },
  { displayName: '   ', rawName: '海葡萄厂', supplierLabel: '海葡萄厂' },
  { displayName: null, rawName: '  厂  ', supplierLabel: '厂' },
  { displayName: null, rawName: null, supplierLabel: '—' },
  { displayName: '', rawName: '', supplierLabel: '—' },
  { displayName: '   ', rawName: '   ', supplierLabel: '—' },
];

function shown(input: { readonly line: ProgressLine; readonly nudges?: readonly ProgressNudge[] }): ProgressRow {
  const [first] = progressRows({ lines: [input.line], nudges: input.nudges ?? [] });
  if (first === undefined) throw new Error('expected a progress row');
  return first;
}

function rowById(rows: readonly ProgressRow[], lineId: string): ProgressRow {
  const found = rows.find((row) => row.lineId === lineId);
  if (found === undefined) throw new Error(`missing ${lineId}`);
  return found;
}

describe('采购进度行', () => {
  it('停得越久越靠前，已完成不出现，下一步用最高严重度的原因', () => {
    const rows = progressRows({ lines, nudges });
    expect(rows.map((row) => row.lineId)).toEqual(['stuck', 'open']);
    expect(rows[0]).toMatchObject({ title: '海葡萄', po: 'PO2', stageLabel: '待收货', daysInStage: 9, nextLabel: '逾期未到 送货单未回' });
    expect(rows[1]?.nextLabel).toBeNull();
    expect(rows[0]?.arrival).toEqual({ kind: 'missing', dateText: '—' });
    expect(rows[0]?.supplierLabel).toBe('海葡萄厂');
    expect(rows[1]).toMatchObject({ supplierLabel: '宜侬', arrival: { kind: 'missing', dateText: '—' } });
  });

  it('有确认日且逾期天数大于 0 才是逾期，下一步只取已读到的动作', () => {
    const row = shown({
      line: {
        ...base,
        daysInStage: 2,
        supplier: { displayName: '宜侬', rawName: '其他' },
        nextDue: { dateBuyerConfirmed: '2026-10-01', overdueDays: 4 },
      },
    });
    expect(row).toMatchObject({
      daysInStage: 2,
      dayText: '2',
      stay: '0-3',
      supplierLabel: '宜侬',
      nextLabel: null,
      arrival: { kind: 'overdue', dateText: '2026-10-01' },
    });
    expect(row.supplierLabel.includes('待审核')).toBe(false);
  });

  it('确认日两侧空白仍逾期，下一步里的逾期未到不能单独改成逾期', () => {
    const padded = shown({
      line: { ...base, nextDue: { dateBuyerConfirmed: '  2026-10-01  ', overdueDays: 3 } },
    });
    expect(padded.arrival).toEqual({ kind: 'overdue', dateText: '2026-10-01' });
    for (const overdueDays of unprovenOverdueDays) {
      const row = shown({
        line: { ...base, daysInStage: 4, nextDue: { dateBuyerConfirmed: '2026-12-01', overdueDays } },
        nudges: [{ lineId: 'row', severity: 2, reasons: ['逾期未到'] }],
      });
      expect(row.arrival).toEqual({ kind: 'dated', dateText: '2026-12-01' });
      expect(row.nextLabel).toBe('逾期未到');
      expect(row.stay).toBe('4-7');
      expect(row.dayText).toBe('4');
      expect(row.daysInStage).toBe(4);
    }
  });

  it('没有确认日时，正的逾期天数也是缺失', () => {
    expect(shown({ line: { ...base, nextDue: null } }).arrival).toEqual({ kind: 'missing', dateText: '—' });
    for (const dateBuyerConfirmed of blankDates) {
      const row = shown({
        line: { ...base, nextDue: { dateBuyerConfirmed, overdueDays: 4 } },
      });
      expect(row.arrival).toEqual({ kind: 'missing', dateText: '—' });
    }
  });

  it('停留天数按档显示，天数原文留在行上', () => {
    for (const sample of stays) {
      const row = shown({ line: { ...base, daysInStage: sample.days } });
      expect(row.stay).toBe(sample.stay);
      expect(row.dayText).toBe(sample.dayText);
      expect(row.daysInStage).toBe(sample.days);
    }
  });

  it('非有限停留天数单独成行，显示破折号并归入最短一档', () => {
    const rows = progressRows({
      lines: [
        { ...base, id: 'nan', daysInStage: Number.NaN },
        { ...base, id: 'inf', daysInStage: Number.POSITIVE_INFINITY },
        { ...base, id: 'neginf', daysInStage: Number.NEGATIVE_INFINITY },
      ],
      nudges: [],
    });
    const nan = rowById(rows, 'nan');
    const inf = rowById(rows, 'inf');
    const negative = rowById(rows, 'neginf');
    expect(Number.isNaN(nan.daysInStage)).toBe(true);
    expect(nan.dayText).toBe('—');
    expect(nan.stay).toBe('0-3');
    expect(inf.daysInStage).toBe(Number.POSITIVE_INFINITY);
    expect(inf.dayText).toBe('—');
    expect(inf.stay).toBe('0-3');
    expect(negative.daysInStage).toBe(Number.NEGATIVE_INFINITY);
    expect(negative.dayText).toBe('—');
    expect(negative.stay).toBe('0-3');
  });

  it('供应商先用显示名，空白才用原名，都没有就是破折号', () => {
    for (const sample of supplierCases) {
      const row = shown({
        line: { ...base, supplier: { displayName: sample.displayName, rawName: sample.rawName } },
      });
      expect(row.supplierLabel).toBe(sample.supplierLabel);
      expect(row.supplierLabel.includes('待审核')).toBe(false);
    }
  });

  it('空名字和空单号沿用原来的占位', () => {
    const row = shown({ line: { ...base, nameRaw: null, poRaw: null } });
    expect(row.title).toBe('未命名');
    expect(row.po).toBe('—');
  });

  it('逾期仍是逾期未到，有日期和没日期不是同一种状态', () => {
    expect(arrivalPaint('overdue')).toEqual({ kind: 'status', status: 'overdue' });
    expect(arrivalPaint('missing')).toEqual({ kind: 'missing', reason: 'not_provided' });
    expect(arrivalPaint('dated')).toEqual({ kind: 'status', status: 'confirmed' });
    expect(arrivalPaint('missing')).not.toEqual(arrivalPaint('dated'));
  });
});
