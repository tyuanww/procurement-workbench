import { expect, it } from 'vitest';
import { planFactoryLinks } from '../../packages/application/src/factory-links/index.js';
import type { FactoryRowMatchRef, OrderLineMatchRef } from '../../packages/application/src/ports/factory-link-views.js';

it('待裁决：同一订单行的两个排产日期格仍是第一个 matched、后面的 conflict', () => {
  const line: OrderLineMatchRef = {
    orderLineId: 'line-1',
    poNorm: 'PO1',
    itemCodeNorm: 'ITEM1',
    barcodeNorm: null,
    linkId: null,
    linkStatus: null,
    linkReason: null,
  };
  const planned = planFactoryLinks({ orderLines: [line], factoryRows: [cell('cell-day-2'), cell('cell-day-1')] });
  expect(planned.map((item) => ({ rowId: item.row.rowId, kind: item.kind }))).toEqual([
    { rowId: 'cell-day-2', kind: 'matched' },
    { rowId: 'cell-day-1', kind: 'conflict' },
  ]);
});

function cell(rowId: string): FactoryRowMatchRef {
  return {
    rowId,
    kind: 'schedule',
    factoryPartyId: 'factory-1',
    poNorm: 'PO1',
    itemCodeNorm: 'ITEM1',
    barcodeNorm: null,
    poRaw: 'PO1',
    itemCodeRaw: 'ITEM1',
    barcodeRaw: null,
    linkStatus: 'unlinked',
    linkReason: null,
    linkedOrderLineId: null,
  };
}
