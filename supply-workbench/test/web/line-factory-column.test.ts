import { describe, expect, it } from 'vitest';
import { OrderLineRowSchema, type OrderLineRow } from '../../packages/contracts/src/index.js';
import { lineCell, readDesk } from '../../apps/web/src/features/follow-up/index.js';

const NOW = new Date('2026-11-03T00:00:00+08:00');

describe('跟进台工厂列', () => {
  it('成品线在供应商后加工厂列，物料线保持原列不变', () => {
    const finished = readDesk('lane=finished').columns.map((column) => column.key);
    expect(finished.slice(0, 4)).toEqual(['po', 'name', 'supplier', 'factory']);
    expect(finished.includes('factory')).toBe(true);
    expect(readDesk('lane=material').columns.map((column) => column.key).includes('factory')).toBe(false);
    expect(readDesk('lane=finished').columns.find((column) => column.key === 'factory')?.title).toBe('工厂');
  });

  it('有工厂显示名字，未关联或没有工厂字段都显示未关联，不造假名字', () => {
    expect(factoryCell(rowWith({ id: 'factory-1', displayName: '甲代工厂' }))).toEqual({ kind: 'text', text: '甲代工厂' });
    expect(factoryCell(rowWith(null))).toEqual({ kind: 'text', text: '未关联' });
    expect(factoryCell(rowWithoutFactory())).toEqual({ kind: 'text', text: '未关联' });
    expect(factoryCell(rowWith({ id: 'factory-1', displayName: null }))).toEqual({ kind: 'text', text: '未关联' });
  });

  it('契约里 factory 是可选字段，缺失或 null 都能解析', () => {
    expect(rowWithoutFactory().factory).toBeUndefined();
    expect(rowWith({ id: 'factory-1', displayName: '甲代工厂' }).factory).toEqual({ id: 'factory-1', displayName: '甲代工厂' });
    expect(rowWith(null).factory).toBeNull();
  });
});

function factoryCell(row: OrderLineRow) {
  return lineCell({ column: 'factory', row, now: NOW });
}

function rowWithoutFactory(): OrderLineRow {
  return OrderLineRowSchema.parse(baseRow());
}

function rowWith(factory: { readonly id: string; readonly displayName: string | null } | null): OrderLineRow {
  return OrderLineRowSchema.parse({ ...baseRow(), factory });
}

function baseRow() {
  return {
    id: 'line-1',
    lane: 'finished',
    po: { id: 'po-1', poRaw: 'PO1', poFormat: 'NONE' },
    nameRaw: '面膜',
    itemCodeRaw: null,
    barcodeRaw: null,
    supplier: { id: null, displayName: '样例供应商37', rawName: null },
    receiver: null,
    qtyOrdered: 10,
    receivedQty: 1,
    factoryDeliveredQty: { value: null, missingReason: 'no_matching_record', provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } },
    stage: 'awaiting_shipment',
    nextDue: null,
    daysInStage: 3,
    buyer: null,
    statusReported: '在途',
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  };
}
