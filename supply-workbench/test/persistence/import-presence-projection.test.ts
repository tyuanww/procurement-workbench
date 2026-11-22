import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { localDate, missingFlagOf, projectLatestImportPresence, type LatestImportPresence } from '../../packages/domain/src/index.js';
import { toRow, type ListWorld } from '../../packages/persistence/src/queries/follow-up/line-row.js';
import type { orderLines, purchaseOrders } from '../../packages/persistence/src/schema/orders.js';

const at = '2026-10-13T00:00:00.000Z';

type Line = typeof orderLines.$inferSelect;
type Order = typeof purchaseOrders.$inferSelect;

it('快照读模型在两个字段矛盾时以 latestImportPresence 派生布尔值', () => {
  const row = followUpRow({ latestImportPresence: 'present', missingInLatestImport: true });
  expect(row.latestImportPresence).toBe('present');
  expect(row.missingInLatestImport).toBe(missingFlagOf('present'));
});

it('快照读模型不把 unknown 和 not_applicable 的冗余布尔当成缺失', () => {
  const unknown = followUpRow({ latestImportPresence: 'unknown', missingInLatestImport: true });
  const skipped = followUpRow({ latestImportPresence: 'not_applicable', missingInLatestImport: true, origin: 'manual' });
  expect(unknown.missingInLatestImport).toBe(missingFlagOf('unknown'));
  expect(unknown.latestImportPresence).toBe('unknown');
  expect(skipped.missingInLatestImport).toBe(missingFlagOf('not_applicable'));
  expect(skipped.latestImportPresence).toBe('not_applicable');
});

it('快照读模型在字段一致时保持原有缺失结果', () => {
  const missing = followUpRow({ latestImportPresence: 'missing', missingInLatestImport: true });
  const present = followUpRow({ latestImportPresence: 'present', missingInLatestImport: false });
  expect(missing.missingInLatestImport).toBe(true);
  expect(missing.latestImportPresence).toBe('missing');
  expect(present.missingInLatestImport).toBe(false);
  expect(present.latestImportPresence).toBe('present');
});

it('导入提交不再单独赋值 missingInLatestImport', () => {
  const source = readFileSync(new URL('../../packages/application/src/imports/use-cases/commit-import.ts', import.meta.url), 'utf8');
  expect(source.includes('missingInLatestImport:')).toBe(false);
});

it('枚举已存在时派生函数丢掉互相矛盾的布尔值', () => {
  expect(projectLatestImportPresence({ latestImportPresence: 'missing', missingInLatestImport: false, origin: 'import_po_master' })).toEqual({ latestImportPresence: 'missing', missingInLatestImport: true });
  expect(projectLatestImportPresence({ missingInLatestImport: true, origin: 'manual' })).toEqual({ latestImportPresence: 'not_applicable', missingInLatestImport: false });
  expect(projectLatestImportPresence({ missingInLatestImport: true, origin: 'import_po_master' })).toEqual({ latestImportPresence: 'missing', missingInLatestImport: true });
});

it('订单行仓库不再自己用 missingFlagOf 写第二份布尔值', () => {
  const source = readFileSync(new URL('../../packages/persistence/src/repositories/order-lines.ts', import.meta.url), 'utf8');
  expect(source.includes('projectLatestImportPresence')).toBe(true);
  expect(source.includes('missingFlagOf')).toBe(false);
});

function followUpRow(input: { readonly latestImportPresence: LatestImportPresence; readonly missingInLatestImport: boolean; readonly origin?: string }) {
  const line = storedLine(input);
  const order = storedOrder(line.purchaseOrderId);
  return toRow({ line, world: worldOf(line, order), clock: { today: () => localDate('2026-10-13'), now: () => at }, timeZone: 'Asia/Shanghai' });
}

function worldOf(line: Line, order: Order): ListWorld {
  return {
    lines: [line],
    orders: new Map([[order.id, order]]),
    parties: new Map(),
    users: new Map(),
    batches: [],
    receipts: [],
    exceptions: [],
    snapshots: [],
    factoryShipments: [],
    factoryLinks: new Map(),
    activeFactoryBatchIds: new Set(),
  };
}

function storedOrder(id: string): Order {
  return {
    id,
    createdAt: at,
    updatedAt: at,
    poRaw: 'PO-1',
    poNorm: 'PO-1',
    poFormat: 'OTHER',
    relatedPoRaws: [],
    supplierPartyId: null,
    supplierRaw: null,
    lane: 'finished',
    oaDemandRef: null,
  };
}

function storedLine(input: { readonly latestImportPresence: LatestImportPresence; readonly missingInLatestImport: boolean; readonly origin?: string }): Line {
  return {
    id: 'line-1',
    createdAt: at,
    updatedAt: at,
    purchaseOrderId: 'po-1',
    lane: 'finished',
    itemId: null,
    itemCodeRaw: null,
    barcodeRaw: null,
    nameRaw: '海葡萄',
    qtyOrdered: null,
    unit: null,
    buyerUserId: null,
    receiverPartyId: null,
    origin: input.origin ?? 'import_po_master',
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: input.missingInLatestImport,
    latestImportPresence: input.latestImportPresence,
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: at,
    nextDueBatchId: null,
    nextDueDate: null,
  };
}
