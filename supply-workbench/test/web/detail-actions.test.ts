import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { BatchViewSchema } from '../../packages/contracts/src/index.js';
import type { BatchStatus } from '../../packages/domain/src/index.js';
import { actionsOf } from '../../apps/web/src/features/today/model/actions.js';
import { shortcutAction } from '../../apps/web/src/features/today/model/group.js';
import type { BoardItem } from '../../apps/web/src/features/today/model/types.js';
import { canAddBatch, createDraft, openBatchActions, RecordForm, shipDraft, showsRecordEdits, voidableShipments } from '../../apps/web/src/features/follow-up/index.js';
import { FulfillmentRecords } from '../../apps/web/src/pages/lines/detail/fulfillment.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const OPEN: readonly BatchStatus[] = ['awaiting_date', 'confirmed', 'shipped', 'partially_received'];
const CLOSED: readonly BatchStatus[] = ['received', 'closed', 'cancelled'];

it('未关闭批次可以登记发货和收货，今日待确认日仍不给发货', () => {
  for (const status of OPEN) {
    expect(openBatchActions(status).map((action) => action.label)).toEqual(['登记发货', '登记收货']);
  }
  for (const status of CLOSED) expect(openBatchActions(status)).toEqual([]);
  expect(canAddBatch({ cancelledAt: null })).toBe(true);
  expect(canAddBatch({ cancelledAt: '2026-10-01T00:00:00.000Z' })).toBe(false);
  expect(shortcutAction('s')).toBe('ship');
  expect(shortcutAction('r')).toBe('receipt');
  expect(actionsOf(boardItem('awaiting_date')).map((action) => action.label)).toEqual(['改确认日', '记跟进']);
  expect(shipDraft({ batchId: 'batch-1', plannedQty: 10, shippedQty: null, today: '2026-10-12' }).qty).toBe(10);
  expect(createDraft({ lineId: 'line-1', qtyOrdered: 0, receiverPartyId: 'wh', warehouses: [] })).toEqual({
    kind: 'create',
    lineId: 'line-1',
    plannedQty: null,
    receiverPartyId: '',
  });
});

it('关闭或取消不再给出确认日和作废，已收货仍可以改确认日并作废发货', () => {
  expect(showsRecordEdits('received')).toBe(true);
  expect(showsRecordEdits('confirmed')).toBe(true);
  expect(showsRecordEdits('closed')).toBe(false);
  expect(showsRecordEdits('cancelled')).toBe(false);
  const live = { id: 'ship-1', qty: 1, voidedAt: null };
  expect(voidableShipments('closed', [live])).toEqual([]);
  expect(voidableShipments('cancelled', [live])).toEqual([]);
  expect(voidableShipments('received', [live])).toEqual([live]);
  expect(actionsOf(boardItem('received')).map((action) => action.label)).toContain('改确认日');
  const page = readFileSync(new URL('../../apps/web/src/pages/lines/detail/LineDetailPage.tsx', import.meta.url), 'utf8');
  expect(page.includes('showsRecordEdits')).toBe(true);
  expect(page.includes('FulfillmentRecords')).toBe(true);
});

it('发货表单把错误留在上面，数量还在', () => {
  const html = markup(RecordForm, {
    draft: { kind: 'ship', batchId: 'batch-1', qty: 0, shippedOn: '2026-10-12' },
    error: '',
    warehouses: [],
    onChange: () => undefined,
  });
  expect(html).toContain('数量必须大于 0');
  expect(html).toContain('发货日');
});

it('有到仓凭据查看权限的采购，关闭批次后仍能追溯实收', () => {
  const date = '2026-10-12';
  const batch = BatchViewSchema.parse({
    id: 'batch-1', orderLineId: 'line-1', seq: 1, plannedQty: 1, receiverPartyId: 'wh',
    dateFactoryRequired: null, dateSupplierPromised: null, dateBuyerConfirmed: date, firstConfirmedDate: date,
    confirmedBy: 'buyer', confirmedAt: date, status: 'closed', statusChangedAt: date, origin: 'manual', originRef: null,
    closedAt: date, closedReason: '收齐', cancelledAt: null, cancelReason: null, shipments: [],
    receipts: [{
      id: 'receipt-1', batchId: 'batch-1', qty: 1, receivedOn: date, category: 'finished', source: 'workbench',
      fulfillment: { kind: 'received', disposition: 'normal', unit: '件', evidence: '仓库签收单 ABC',
        reviewReason: null, arrival: { arrivalId: 'arrival-1', revision: 1 } },
      createdBy: 'buyer', note: null, voidedAt: null, voidedBy: null, voidReason: null,
    }],
    deliveryNote: null, shippedQty: 1, receivedQty: 1, qtyVariance: 0, noteStatus: 'missing',
    overdueDays: null, daysInStage: 0, dateChanges: [],
  });
  const router = requireWeb('react-router');
  const react = requireWeb('react');
  if (!isRecord(router) || !('MemoryRouter' in router) || !isCreator(react)) throw new Error('web 路由模块不齐');
  const render = (canViewArrival: boolean) => markup(router.MemoryRouter, {
    children: react.createElement(FulfillmentRecords, {
      batch, canEdit: false, canViewArrival, onReload: () => undefined, onVerify: () => undefined,
    }),
  });
  expect(render(true)).toContain('href="/lines?arrival=arrival-1"');
  expect(render(false)).not.toContain('查看到仓凭据');
});

function boardItem(batchStatus: BatchStatus): BoardItem {
  return {
    id: 'todo-1',
    severity: 2,
    overdueDays: null,
    dueDate: null,
    lineId: 'line-1',
    waitingName: '宜侬',
    reasons: ['missing_date'],
    poRaw: null,
    productName: '面膜',
    qty: 10,
    batchStatus,
  };
}

function markup(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, props));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
