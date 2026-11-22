import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import type { ImportBatch, ImportRow } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeDiscardImport, makeStartImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aBatch, aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { committedLine, sampleProduct } from './import-fixtures.js';

const at = '2026-10-12T00:00:00.000Z';

function cell<T>(value: T) {
  return { raw: value === null ? null : String(value), value };
}

function batch(id: string, template: ImportBatch['template'] = 'po-master-v1'): ImportBatch {
  return {
    id: entityId(id),
    createdAt: at,
    updatedAt: at,
    fileId: entityId('file-1'),
    template,
    factoryPartyId: null,
    status: 'parsed',
    fileMeta: null,
    stats: null,
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] },
    createdBy: entityId('buyer-1'),
    committedBy: null,
    committedAt: null,
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  };
}

function coverageBatch(id: string, coverage: NonNullable<ImportBatch['coverage']>): ImportBatch {
  return { ...batch(id), coverage };
}

function poRow(id: string, batchId: string): ImportRow {
  return {
    id: entityId(id),
    importBatchId: entityId(batchId),
    sheetName: '总表',
    rowNo: 2,
    raw: {},
    parsed: {
      oaDemandRef: cell(null),
      supplierRaw: cell('宜侬'),
      nameRaw: cell('海葡萄'),
      barcodeRaw: cell('2000000003023'),
      qtyOrdered: cell(10),
      oaSubmittedOn: cell(null),
      oaRequiredOn: cell(null),
      plannedDurationDays: cell(null),
      po: cell({ poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [] }),
      actualStartOn: cell(null),
      firstDeliveryOn: cell(null),
      actualEndOn: cell(null),
      actualDurationDays: cell(null),
      factoryStockReported: cell(null),
      shippedQtyReported: cell(null),
      qtyDiffReported: cell(null),
      statusReported: cell('进行中'),
    },
    issues: [],
    action: 'create',
    targetId: null,
    skipReason: null,
  };
}

function namedRow({ id, batchId, patch }: { readonly id: string; readonly batchId: string; readonly patch: { readonly po: unknown; readonly nameRaw: unknown; readonly rowNo?: number } }): ImportRow {
  const row = poRow(id, batchId);
  if (typeof row.parsed !== 'object' || row.parsed === null) return row;
  return { ...row, rowNo: patch.rowNo ?? row.rowNo, parsed: { ...row.parsed, po: patch.po, nameRaw: patch.nameRaw } };
}

function buyer() {
  return aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
}

function deps(memory: ReturnType<typeof createMemory>) {
  return { uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() };
}

it('管理层调用 startImport 被拒绝', async () => {
  const memory = createMemory();
  const start = makeStartImport({ ...deps(memory), files: memory.files, workbooks: { read: async () => { throw new Error('不该读表'); } }, templates: [] });
  await expect(start({ fileId: entityId('missing'), template: 'po-master-v1' }, aUser({ roles: ['manager'] }))).rejects.toThrow(/不允许/);
});
it('有未处理冲突时提交被拒绝', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), action: 'conflict' });
  const commit = makeCommitImport(deps(memory));
  await expect(commit({ importBatchId: 'b1' }, buyer())).rejects.toThrow(/冲突/);
  expect((await memory.stores.imports.get('b1')).status).toBe('parsed');
});
it('提交中途出错时内存库没有任何变化', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow(poRow('r1', 'b1'));
  const commit = makeCommitImport({
    ...deps(memory),
    uow: {
      async run(fn) {
        return memory.unitOfWork.run(async (tx) => fn({
          ...tx,
          orderLines: {
            ...tx.orderLines,
            save: async (line) => {
              await tx.orderLines.save(line);
              throw new Error('注入');
            },
          },
        }));
      },
    },
  });
  await expect(commit({ importBatchId: 'b1' }, buyer())).rejects.toThrow(/注入/);
  expect((await memory.stores.imports.get('b1')).status).toBe('parsed');
  expect(await memory.stores.orderLines.find('r1:line')).toBeUndefined();
  expect(memory.box.current.audit).toEqual([]);
});

it('比对已经标成不变的行再次提交不新建订单行，也不改数量', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow(poRow('r1', 'b1'));
  await commit({ importBatchId: 'b1' }, buyer());
  await memory.stores.imports.save(batch('b2'));
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b2'), action: 'unchanged' });
  await commit({ importBatchId: 'b2' }, buyer());
  expect((await memory.stores.imports.listRows('b2'))[0]).toMatchObject({ action: 'unchanged', targetId: 'r1:line' });
  expect(await memory.stores.orderLines.find('r2:line')).toBeUndefined();
  expect((await memory.stores.orderLines.find('r1:line'))?.qtyOrdered).toBe(10);
});

it('同一单号的两行挂在同一张采购单上', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow(poRow('r1', 'b1'));
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b1'), rowNo: 3 });
  await commit({ importBatchId: 'b1' }, buyer());
  const first = await memory.stores.orderLines.find('r1:line');
  const second = await memory.stores.orderLines.find('r2:line');
  expect(first?.purchaseOrderId).toBe(second?.purchaseOrderId);
  expect(await memory.stores.purchaseOrders.find('r2:po')).toBeUndefined();
});

it('空单号和不同品名不会并成同一行', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow(namedRow({ id: 'r1', batchId: 'b1', patch: { po: cell(null), nameRaw: cell('面膜') } }));
  await commit({ importBatchId: 'b1' }, buyer());
  await memory.stores.imports.save(batch('b2'));
  await memory.stores.imports.saveRow({ ...namedRow({ id: 'r2', batchId: 'b2', patch: { po: cell(null), nameRaw: cell('面膜') } }), action: 'unchanged' });
  await memory.stores.imports.saveRow(namedRow({ id: 'r3', batchId: 'b2', patch: { po: cell(null), nameRaw: cell('精华'), rowNo: 3 } }));
  await commit({ importBatchId: 'b2' }, buyer());
  expect((await memory.stores.imports.listRows('b2')).find((row) => row.id === 'r2')?.action).toBe('unchanged');
  expect(await memory.stores.orderLines.find('r3:line')).toBeDefined();
});

it('回滚在数据回退实现前被禁用', async () => {
  const memory = createMemory();
  await memory.stores.imports.save({ ...batch('b1'), status: 'committed', committedAt: at });
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), targetId: entityId('line-1') });
  await memory.stores.orderLines.save({
    ...(await committedLine(memory, at)),
  });
  const made = aBatch().build();
  await memory.stores.batches.save({ ...made, orderLineId: orderLineId('line-1') });
});

it('产品档案重新导入不覆盖工作台改过的品名', async () => {
  const memory = createMemory();
  const product = sampleProduct(at);
  await memory.stores.products.save(product);
  await memory.stores.imports.save({ ...batch('b1', 'product-archive-v1') });
  await memory.stores.imports.saveRow({
    ...poRow('r1', 'b1'),
    action: 'update',
    targetId: product.id,
    parsed: {
      filingName: cell('新备案'),
      filingNo: cell(null),
      skuName: cell('文件品名'),
      barcodeRaw: cell(product.barcodeRaw),
      netContent: cell(null),
      casePack: cell(null),
      outerSize: cell(null),
      contactNameRaw: cell(null),
    },
  });
  await makeCommitImport(deps(memory))({ importBatchId: 'b1' }, buyer());
  expect((await memory.stores.products.get(product.id)).skuName).toBe('工作台品名');
  expect((await memory.stores.imports.listRows('b1'))[0]?.issues.map((issue) => issue.code)).toContain('PRODUCT_FIELD_KEPT');
});

it('身份字段在但单元格不是解析结果时提交失败', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow({
    ...poRow('r1', 'b1'),
    parsed: { po: 'PO1', barcodeRaw: cell('2000000003023'), nameRaw: cell('海葡萄') },
  });
  await expect(makeCommitImport(deps(memory))({ importBatchId: 'b1' }, buyer())).rejects.toThrow(/采购订单行无法读取/);
  expect((await memory.stores.imports.get('b1')).status).toBe('parsed');
});

it('产品档案身份字段在但形状不对时提交失败', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1', 'product-archive-v1'));
  await memory.stores.imports.saveRow({
    ...poRow('r1', 'b1'),
    parsed: { barcodeRaw: '2000000003023', contactNameRaw: cell(null) },
  });
  await expect(makeCommitImport(deps(memory))({ importBatchId: 'b1' }, buyer())).rejects.toThrow(/产品档案行无法读取/);
  expect((await memory.stores.imports.get('b1')).status).toBe('parsed');
});

it('放弃导入写审计', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await makeDiscardImport(deps(memory))({ importBatchId: 'b1' }, buyer());
  expect(memory.box.current.audit).toHaveLength(1);
  expect((await memory.stores.imports.get('b1')).status).toBe('discarded');
});

it('别名出现次数按有效原始行数累计，并单独记录批次数', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('alias-b1'));
  await memory.stores.imports.saveRow(poRow('alias-r1', 'alias-b1'));
  await memory.stores.imports.saveRow({ ...poRow('alias-r2', 'alias-b1'), rowNo: 3 });
  await memory.stores.imports.saveRow({ ...poRow('alias-r3', 'alias-b1'), rowNo: 4 });
  await commit({ importBatchId: 'alias-b1' }, buyer());
  const first = await memory.stores.aliases.get('alias:宜侬');
  expect(first.seenCount).toBe(3);
  expect(first.seenBatchCount).toBe(1);

  await memory.stores.imports.save(batch('alias-b2'));
  await memory.stores.imports.saveRow({ ...poRow('alias-r4', 'alias-b2'), action: 'unchanged' });
  await memory.stores.imports.saveRow({ ...poRow('alias-r5', 'alias-b2'), action: 'skip', rowNo: 3 });
  await commit({ importBatchId: 'alias-b2' }, buyer());
  const second = await memory.stores.aliases.get('alias:宜侬');
  expect(second.seenCount).toBe(5);
  expect(second.seenBatchCount).toBe(2);
});

it('采购总表提交后会标记不在最新批次的历史订单行', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('presence-b1'));
  await memory.stores.imports.saveRow(poRow('presence-r1', 'presence-b1'));
  await commit({ importBatchId: 'presence-b1' }, buyer());
  const first = await memory.stores.orderLines.find('presence-r1:line');
  expect(first?.missingInLatestImport).toBe(false);
  expect(first?.latestImportPresence).toBe('present');

  await memory.stores.imports.save(batch('presence-b2'));
  await memory.stores.imports.saveRow(namedRow({
    id: 'presence-r2',
    batchId: 'presence-b2',
    patch: { po: cell({ poRaw: 'PO-2', poNorm: 'PO-2', poFormat: 'OTHER', relatedPoRaws: [] }), nameRaw: cell('另一品') },
  }));
  await commit({ importBatchId: 'presence-b2' }, buyer());
  expect((await memory.stores.orderLines.find('presence-r1:line'))?.missingInLatestImport).toBe(true);
  expect((await memory.stores.orderLines.find('presence-r1:line'))?.latestImportPresence).toBe('missing');
  expect((await memory.stores.orderLines.find('presence-r2:line'))?.missingInLatestImport).toBe(false);
  expect((await memory.stores.orderLines.find('presence-r2:line'))?.latestImportPresence).toBe('present');
});

it('partial 采购批次只提交出现的订单行，不把未出现行误标为缺失', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(coverageBatch('partial-b1', 'full_snapshot'));
  await memory.stores.imports.saveRow(poRow('partial-r1', 'partial-b1'));
  await commit({ importBatchId: 'partial-b1' }, buyer());
  await memory.stores.imports.save(coverageBatch('partial-b2', 'partial'));
  await memory.stores.imports.saveRow(namedRow({
    id: 'partial-r2',
    batchId: 'partial-b2',
    patch: { po: cell({ poRaw: 'PO-2', poNorm: 'PO-2', poFormat: 'OTHER', relatedPoRaws: [] }), nameRaw: cell('另一品') },
  }));
  await commit({ importBatchId: 'partial-b2' }, buyer());
  expect((await memory.stores.orderLines.find('partial-r1:line'))?.missingInLatestImport).toBe(false);
  expect((await memory.stores.orderLines.find('partial-r1:line'))?.latestImportPresence).toBe('unknown');
  expect((await memory.stores.orderLines.find('partial-r2:line'))?.missingInLatestImport).toBe(false);
  expect((await memory.stores.orderLines.find('partial-r2:line'))?.latestImportPresence).toBe('unknown');
});
